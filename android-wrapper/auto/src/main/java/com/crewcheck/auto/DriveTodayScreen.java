package com.crewcheck.auto;

import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.HostException;
import androidx.car.app.model.Action;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Pane;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import java.util.List;

/** A short, read-only operational glance using the host's driving-safe templates. */
final class DriveTodayScreen extends DriveScreen {
    DriveTodayScreen(CarContext context) { super(context); }

    @Override @NonNull public Template onGetTemplate() {
        DriveSnapshot snapshot = repository.snapshot();
        long now = repository.now();
        if (snapshot == null || !snapshot.isFresh(now)) {
            return new MessageTemplate.Builder("Abra o Phone Lab no celular para atualizar a programação.")
                    .setTitle("Hoje").setHeaderAction(Action.BACK).build();
        }
        if ("OFF_DUTY".equals(snapshot.state)) {
            return new MessageTemplate.Builder("Folga. Nenhum deslocamento foi sugerido pela escala.")
                    .setTitle("Hoje").setHeaderAction(Action.BACK).build();
        }

        Pane.Builder pane = new Pane.Builder();
        pane.addRow(new Row.Builder().setTitle("Programação")
                .addText(snapshot.flight.isEmpty() ? "Sem voo atual confirmado" : snapshot.flight).build());
        if (!snapshot.presentationTime.isEmpty() || !snapshot.place.isEmpty()) {
            String presentation = (snapshot.presentationTime + "  " + snapshot.place).trim();
            pane.addRow(new Row.Builder().setTitle("Apresentação").addText(presentation).build());
        }
        List<DriveSnapshot.Destination> destinations = snapshot.destinations(now);
        if (!destinations.isEmpty()) {
            DriveSnapshot.Destination destination = destinations.get(0);
            pane.addRow(new Row.Builder().setTitle("Destino")
                    .addText(destination.title).build());
            pane.addAction(new Action.Builder().setTitle("Abrir rota")
                    .setOnClickListener(() -> navigate(destination)).build());
        }
        return new PaneTemplate.Builder(pane.build()).setTitle("Hoje")
                .setHeaderAction(Action.BACK).build();
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
