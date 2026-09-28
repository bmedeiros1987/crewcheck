package com.crewcheck.auto;

import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.annotation.NonNull;

/** Refresh only while visible; no polling service or background location. */
abstract class DriveScreen extends Screen {
    protected final DriveRepository repository;
    DriveScreen(CarContext context) {
        super(context);
        repository = DriveRepository.get(context);
        Runnable update = this::invalidate;
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override public void onStart(@NonNull LifecycleOwner owner) { repository.start(update); }
            @Override public void onStop(@NonNull LifecycleOwner owner) { repository.stop(update); }
            @Override public void onDestroy(@NonNull LifecycleOwner owner) { repository.stop(update); }
        });
    }
}
