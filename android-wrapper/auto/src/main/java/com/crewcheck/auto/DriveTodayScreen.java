package com.crewcheck.auto;

import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.HostException;
import androidx.car.app.model.Action;
import androidx.car.app.model.CarIcon;
import androidx.car.app.model.CarColor;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Pane;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.core.graphics.drawable.IconCompat;
import java.util.List;

/** A short, read-only operational glance using the host's driving-safe templates. */
final class DriveTodayScreen extends DriveScreen {
    DriveTodayScreen(CarContext context) { super(context); }

    @Override @NonNull public Template onGetTemplate() {
        DriveSnapshot snapshot = repository.snapshot();
        long now = repository.now();
        if (snapshot == null || !snapshot.isFresh(now)) {
            return new MessageTemplate.Builder("Programação indisponível no carro. Abra o Drive Lab no celular para atualizar.")
                    .setTitle("CrewCheck • Escala").setHeaderAction(Action.BACK).build();
        }
        if ("OFF_DUTY".equals(snapshot.state)) {
            return new MessageTemplate.Builder("Dia de folga. A escala não indica deslocamento agora.")
                    .setTitle("CrewCheck • Escala").setHeaderAction(Action.BACK).build();
        }

        Pane.Builder pane = new Pane.Builder();
        pane.addRow(new Row.Builder().setTitle("Voo atual")
                .addText(snapshot.flight.isEmpty() ? "Sem voo confirmado" : snapshot.flight)
                .setImage(icon(R.drawable.ic_drive_flight)).build());
        if (!snapshot.presentationTime.isEmpty() || !snapshot.place.isEmpty()) {
            String presentation = snapshot.presentationTime.isEmpty()
                    ? "Apresentação" : "Apresentação • " + snapshot.presentationTime;
            pane.addRow(new Row.Builder().setTitle(presentation)
                    .addText(snapshot.place.isEmpty() ? "Local não informado" : snapshot.place)
                    .setImage(icon(R.drawable.ic_drive_clock)).build());
        }
        if (!snapshot.flight.isEmpty()) {
            pane.addRow(new Row.Builder().setTitle("Status e portão")
                    .addText("Aguardando informação confirmada")
                    .setImage(icon(R.drawable.ic_drive_gate)).build());
        }
        List<DriveSnapshot.Destination> destinations = snapshot.destinations(now);
        if (!destinations.isEmpty()) {
            DriveSnapshot.Destination destination = destinations.get(0);
            pane.addRow(new Row.Builder().setTitle("Destino da escala")
                    .addText(destination.title)
                    .setImage(icon(R.drawable.ic_drive_route)).build());
            pane.addAction(new Action.Builder().setTitle("Abrir no GPS")
                    .setOnClickListener(() -> navigate(destination)).build());
        }
        return new PaneTemplate.Builder(pane.build()).setTitle("CrewCheck • Escala")
                .setHeaderAction(Action.BACK).build();
    }

    private CarIcon icon(int drawable) {
        return new CarIcon.Builder(IconCompat.createWithResource(getCarContext(), drawable))
                .setTint(CarColor.PRIMARY).build();
    }

    private void navigate(DriveSnapshot.Destination destination) {
        if (!repository.mayNavigate(destination)) { invalidate(); return; }
        try {
            getCarContext().startCarApp(new Intent(CarContext.ACTION_NAVIGATE)
                    .setData(Uri.parse(destination.geoUri())));
        } catch (HostException | SecurityException | IllegalArgumentException error) {
            CarToast.makeText(getCarContext(), "Não foi possível abrir o GPS nesta central.",
                    CarToast.LENGTH_LONG).show();
        }
    }
}
