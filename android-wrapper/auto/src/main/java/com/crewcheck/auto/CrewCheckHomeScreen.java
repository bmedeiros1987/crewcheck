package com.crewcheck.auto;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

public final class CrewCheckHomeScreen extends Screen {
    public CrewCheckHomeScreen(@NonNull CarContext carContext) {
        super(carContext);
    }

    @Override
    @NonNull
    public Template onGetTemplate() {
        ItemList items = new ItemList.Builder()
                .addItem(new Row.Builder()
                        .setTitle("Próximo deslocamento")
                        .addText("Aeroporto, hotel e horário crítico em uma experiência de baixa distração.")
                        .build())
                .addItem(new Row.Builder()
                        .setTitle("Destinos da jornada")
                        .addText("A próxima etapa ligará a escala canônica aos pontos relevantes para dirigir.")
                        .build())
                .addItem(new Row.Builder()
                        .setTitle("CrewCheck Drive Lab")
                        .addText("Protótipo isolado: sem publicação e sem alterar o APK principal.")
                        .build())
                .build();

        return new ListTemplate.Builder()
                .setTitle("CrewCheck")
                .setHeaderAction(Action.APP_ICON)
                .setSingleList(items)
                .build();
    }
}
