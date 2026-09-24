using Toybox.Application as App;
using Toybox.Communications;
using Toybox.WatchUi;

class CrewCheckApp extends App.AppBase {
    private var store;

    function initialize() {
        AppBase.initialize();
        store = new SnapshotStore();
    }

    function onStart(state) {
        if (Communications has :registerForPhoneAppMessages) {
            Communications.registerForPhoneAppMessages(method(:onPhoneMessage));
        }
    }

    function onStop(state) {
        if (Communications has :registerForPhoneAppMessages) {
            Communications.registerForPhoneAppMessages(null);
        }
    }

    function getInitialView() {
        var view = new CrewCheckView(store);
        return [ view, new CrewCheckDelegate(view) ];
    }

    function getGlanceView() {
        return [ new CrewCheckGlanceView(store) ];
    }

    function onPhoneMessage(message) {
        if (message == null || message.data == null) {
            return;
        }

        if (store.accept(message.data)) {
            WatchUi.requestUpdate();
        }
    }
}
