using Toybox.WatchUi;

/**
 * Device-independent navigation for the Garmin Watch App.
 *
 * BehaviorDelegate maps to buttons on non-touch devices and swipe/page gestures on touch
 * devices, which keeps the same four CrewCheck pages usable across D2/fenix/Forerunner/Venu.
 */
class CrewCheckDelegate extends WatchUi.BehaviorDelegate {
    private var view;

    function initialize(crewCheckView) {
        BehaviorDelegate.initialize();
        view = crewCheckView;
    }

    function onNextPage() {
        view.nextPage();
        WatchUi.requestUpdate();
        return true;
    }

    function onPreviousPage() {
        view.previousPage();
        WatchUi.requestUpdate();
        return true;
    }

    function onNextMode() {
        return onNextPage();
    }

    function onPreviousMode() {
        return onPreviousPage();
    }
}
