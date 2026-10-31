package com.crewcheck.auto;

import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.HostException;
import androidx.car.app.model.Action;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Pane;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.car.app.CarToast;

final class DriveDestinationScreen extends DriveScreen {
    private final DriveSnapshot.Destination destination;
    DriveDestinationScreen(CarContext context, DriveSnapshot.Destination value) {
        super(context);
        destination = value;
    }
    @Override @NonNull public Template onGetTemplate() {
        if (!repository.mayNavigate(destination)) {
            return new MessageTemplate.Builder("O destino mudou ou os dados expiraram. Volte e atualize a lista.")
                    .setTitle("Atualize o destino").setHeaderAction(Action.BACK).build();
        }
        Pane pane = new Pane.Builder()
                .addRow(new Row.Builder().setTitle(destination.title).addText(destination.query).build())
                .addRow(new Row.Builder().setTitle(destination.context)
                        .addText("Confira o local encontrado no navegador. Terminal e entrada não são inferidos.").build())
                .addAction(new Action.Builder().setTitle("Buscar rota").setOnClickListener(this::navigate).build())
                .build();
        return new PaneTemplate.Builder(pane).setTitle("Destino").setHeaderAction(Action.BACK).build();
    }
    private void navigate() {
        // Recheck on the click, not just when the template was rendered.
        if (!repository.mayNavigate(destination)) { invalidate(); return; }
        try {
            getCarContext().startCarApp(new Intent(CarContext.ACTION_NAVIGATE)
                    .setData(Uri.parse(destination.geoUri())));
        } catch (HostException | SecurityException | IllegalArgumentException error) {
            CarToast.makeText(getCarContext(), "Não foi possível abrir a navegação nesta central.",
                    CarToast.LENGTH_LONG).show();
        }
    }
}
