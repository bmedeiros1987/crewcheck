package com.crewcheck.auto;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.constraints.ConstraintManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import java.util.List;

public final class CrewCheckHomeScreen extends DriveScreen {
    public CrewCheckHomeScreen(@NonNull CarContext context) { super(context); }
    @Override @NonNull public Template onGetTemplate() {
        List<DriveSnapshot.Destination> destinations = repository.destinations();
        Action refresh = new Action.Builder().setTitle("Atualizar")
                .setOnClickListener(repository::refresh).build();
        if (destinations.isEmpty()) {
            String text = repository.status();
            DriveSnapshot snapshot = repository.snapshot();
            if (snapshot != null && snapshot.isFresh(System.currentTimeMillis())) {
                text = "OFF_DUTY".equals(snapshot.state) ? "Sem deslocamento da escala para mostrar."
                        : "Nenhum destino terrestre confirmado neste contexto.";
            }
            return new MessageTemplate.Builder(text + "\nCom o carro estacionado, abra o Drive Lab no celular para configurar destinos.")
                    .setTitle("CrewCheck Drive").setHeaderAction(Action.APP_ICON)
                    .addAction(refresh).build();
        }
        int limit = 5;
        if (getCarContext().getCarAppApiLevel() >= 2) {
            limit = Math.min(limit, getCarContext().getCarService(ConstraintManager.class)
                    .getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST));
        }
        ItemList.Builder items = new ItemList.Builder();
        for (int i = 0; i < Math.min(limit, destinations.size()); i++) {
            DriveSnapshot.Destination destination = destinations.get(i);
            items.addItem(new Row.Builder().setTitle(destination.title).addText(destination.context)
                    .setBrowsable(true).setOnClickListener(() -> getScreenManager().push(
                            new DriveDestinationScreen(getCarContext(), destination))).build());
        }
        return new ListTemplate.Builder().setTitle("CrewCheck Drive").setHeaderAction(Action.APP_ICON)
                .setSingleList(items.build()).setActionStrip(new ActionStrip.Builder().addAction(refresh).build()).build();
    }
}
