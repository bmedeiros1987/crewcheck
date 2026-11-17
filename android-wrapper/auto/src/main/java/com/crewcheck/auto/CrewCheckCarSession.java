package com.crewcheck.auto;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.car.app.Screen;
import androidx.car.app.Session;

public final class CrewCheckCarSession extends Session {
    @Override
    @NonNull
    public Screen onCreateScreen(@NonNull Intent intent) {
        return new CrewCheckHomeScreen(getCarContext());
    }
}
