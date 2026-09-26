package com.crewcheck.auto;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import androidx.car.app.CarContext;
import androidx.car.app.OnDoneCallback;
import androidx.car.app.ScreenManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.serialization.Bundleable;
import androidx.car.app.testing.SessionController;
import androidx.car.app.testing.TestCarContext;
import androidx.lifecycle.Lifecycle;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.util.ReflectionHelpers;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Android framework + official fake car host. Not DHU, not physical IPC or a real login. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 36})
@LooperMode(LooperMode.Mode.PAUSED)
public final class DriveNativeBehaviorTest {
    private Context app;
    private DriveRepository repository;
    private TestCarContext car;
    private SessionController session;

    @Before public void setUp() {
        app = RuntimeEnvironment.getApplication();
        app.getSharedPreferences("crewcheck_drive_lab", Context.MODE_PRIVATE).edit().clear().commit();
        ReflectionHelpers.setStaticField(DriveRepository.class, "instance", null);
        repository = DriveRepository.get(app);
    }
    @After public void tearDown() {
        if (session != null) session.moveToState(Lifecycle.State.DESTROYED);
        Handler handler = ReflectionHelpers.getField(repository, "handler");
        handler.removeCallbacksAndMessages(null);
        ExecutorService io = ReflectionHelpers.getField(repository, "io");
        io.shutdownNow();
        ReflectionHelpers.setStaticField(DriveRepository.class, "instance", null);
        app.getSharedPreferences("crewcheck_drive_lab", Context.MODE_PRIVATE).edit().clear().commit();
    }
    private TestCarContext car() {
        if (car == null) {
            car = TestCarContext.createCarContext(app);
            session = new SessionController(new CrewCheckCarSession(), car, new Intent());
            session.moveToState(Lifecycle.State.RESUMED);
            Shadows.shadowOf(Looper.getMainLooper()).idle();
        }
        return car;
    }
    private void seed(String id, long lifetimeMs) throws Exception {
        long now = System.currentTimeMillis();
        String json = new JSONObject().put("schemaVersion", 1).put("source", "canonical-roster")
                .put("contextId", id).put("generatedAtEpochMs", now)
                .put("validUntilEpochMs", now + lifetimeMs).put("state", "REPORTING")
                .put("presentationPlace", "BSB").put("presentationTime", "08:10")
                .put("currentFlight", "LA0000").toString();
        // Seed only the consumer's already-received state. No phone provider is implemented here.
        ReflectionHelpers.setField(repository, "snapshot", DriveSnapshot.parse(json, now));
        ReflectionHelpers.setField(repository, "safeJson", json);
        ReflectionHelpers.setField(repository, "status", "Escala recebida em modo somente leitura");
        // Hold transport pending to prove UI expiry does not depend on a new provider response.
        ReflectionHelpers.setField(repository, "inFlight", true);
        app.getSharedPreferences("crewcheck_drive_lab", Context.MODE_PRIVATE).edit()
                .putBoolean("sync_enabled", true).commit();
    }
    private void click(Action action) {
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger failures = new AtomicInteger();
        assertNotNull(action.getOnClickDelegate());
        action.getOnClickDelegate().sendClick(new OnDoneCallback() {
            @Override public void onSuccess(Bundleable response) { successes.incrementAndGet(); }
            @Override public void onFailure(Bundleable response) { failures.incrementAndGet(); }
        });
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertEquals(0, failures.get());
        assertEquals(1, successes.get());
    }
    @Test public void sessionCreatesHomeWithHonestEmptyState() {
        assertTrue(car().getCarService(ScreenManager.class).getTop() instanceof CrewCheckHomeScreen);
        assertTrue(car().getCarService(ScreenManager.class).getTop().onGetTemplate() instanceof MessageTemplate);
        assertTrue(car().getStartCarAppIntents().isEmpty());
    }
    @Test public void manualDestinationIsListedWithoutOptingIn() throws Exception {
        repository.addManual("Hotel de teste", "Rua A, Cidade de Teste");
        ListTemplate list = (ListTemplate) new CrewCheckHomeScreen(car()).onGetTemplate();
        assertEquals(1, list.getSingleList().getItems().size());
        Row row = (Row) list.getSingleList().getItems().get(0);
        assertEquals("Hotel de teste", row.getTitle().toString());
        assertFalse(repository.enabled());
    }
    @Test public void manualDestinationUsesHostNavigationAndEncodedGeoQuery() throws Exception {
        repository.addManual("Hotel de teste", "Hotel & Spa #1, Cidade de Teste");
        DriveDestinationScreen detail = new DriveDestinationScreen(car(), repository.manual().get(0));
        PaneTemplate template = (PaneTemplate) detail.onGetTemplate();
        click(template.getPane().getActions().get(0));
        assertEquals(1, car.getStartCarAppIntents().size());
        Intent intent = car.getStartCarAppIntents().get(0);
        assertEquals(CarContext.ACTION_NAVIGATE, intent.getAction());
        assertEquals("geo", intent.getData().getScheme());
        assertTrue(intent.getDataString().contains("%26"));
        assertTrue(intent.getDataString().contains("%23"));
        assertNull(intent.getPackage());
        assertNull(intent.getComponent());
    }
    @Test public void removedManualDestinationCannotUsePreviouslyRenderedButton() throws Exception {
        repository.addManual("Hotel de teste", "Rua A, Cidade de Teste");
        DriveDestinationScreen detail = new DriveDestinationScreen(car(), repository.manual().get(0));
        Action button = ((PaneTemplate) detail.onGetTemplate()).getPane().getActions().get(0);
        repository.clearManual();
        click(button);
        assertTrue(car.getStartCarAppIntents().isEmpty());
        assertTrue(detail.onGetTemplate() instanceof MessageTemplate);
    }
    @Test public void expiredCanonicalDestinationCannotUsePreviouslyRenderedButton() throws Exception {
        seed("journey-a", 1000);
        DriveDestinationScreen detail = new DriveDestinationScreen(car(), repository.destinations().get(0));
        Action button = ((PaneTemplate) detail.onGetTemplate()).getPane().getActions().get(0);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
        click(button);
        assertTrue(car.getStartCarAppIntents().isEmpty());
        assertTrue(detail.onGetTemplate() instanceof MessageTemplate);
    }
    @Test public void changedJourneyCannotUsePreviouslyRenderedButton() throws Exception {
        seed("journey-a", 60_000);
        DriveDestinationScreen detail = new DriveDestinationScreen(car(), repository.destinations().get(0));
        Action button = ((PaneTemplate) detail.onGetTemplate()).getPane().getActions().get(0);
        seed("journey-b", 60_000);
        click(button);
        assertTrue(car.getStartCarAppIntents().isEmpty());
    }
    @Test public void disablingSyncDropsCanonicalDataButPreservesManualDestination() throws Exception {
        repository.addManual("Hotel de teste", "Rua A, Cidade de Teste");
        seed("journey-a", 60_000);
        assertEquals(2, repository.destinations().size());
        repository.setEnabled(false);
        assertNull(repository.snapshot());
        assertEquals(1, repository.destinations().size());
        assertFalse(repository.destinations().get(0).canonical);
    }
    @Test public void expiryNotifiesVisibleUiWithoutWaitingForNextThirtySecondPoll() throws Exception {
        seed("journey-a", 1000);
        AtomicInteger changes = new AtomicInteger();
        Runnable observer = changes::incrementAndGet;
        repository.start(observer);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        changes.set(0);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
        assertTrue(repository.destinations().isEmpty());
        assertTrue("Visible UI must be invalidated at expiry without a fresh transport response", changes.get() > 0);
        repository.stop(observer);
    }
    @Test public void clearedSessionDoesNotKeepPreviousConnectedStatus() throws Exception {
        seed("journey-a", 60_000);
        Runnable observer = () -> {};
        repository.start(observer);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        repository.stop(observer);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
        assertNull(repository.snapshot());
        assertFalse("Do not claim an already discarded snapshot is connected", repository.status().contains("Escala recebida"));
    }
    @Test public void quickScreenHandoffPreservesSnapshotUntilLastScreenLeaves() throws Exception {
        seed("journey-a", 60_000);
        Runnable first = () -> {};
        Runnable second = () -> {};
        repository.start(first);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        repository.stop(first);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500));
        repository.start(second);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
        assertNotNull(repository.snapshot());
        repository.stop(second);
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
        assertNull(repository.snapshot());
    }
}
