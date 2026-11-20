import com.crewcheck.app.NativePushSession;
import com.crewcheck.app.NativePushPolicy;
public class NativePushSessionFixture {
    static int cases;
    static void check(boolean value) { if (!value) throw new AssertionError("case " + cases); cases++; }
    public static void main(String[] args) {
        final NativePushSession.State[] state = {new NativePushSession.State("fake-installation", "", "", 0, 0)};
        final boolean[] fail = {false};
        NativePushSession.Store store = new NativePushSession.Store() {
            public NativePushSession.State read() { return state[0]; }
            public boolean commit(NativePushSession.State next) { if (fail[0]) return false; state[0] = next; return true; }
        };
        NativePushSession off = new NativePushSession(store, false);
        check(!NativePushPolicy.ENABLED && !NativePushPolicy.configured());
        check(off.read() == null && !off.scope("A") && !off.token(0, "fake-token-123456789"));
        check(state[0].generation == 0);
        NativePushSession session = new NativePushSession(store, true);
        check(session.scope("A")); long a = state[0].generation;
        check(session.token(a, "fake-token-123456789")); NativePushSession.State prior = state[0];
        check(session.current(prior));
        check(session.scope("A") && state[0].generation == a); // JWT renewal
        check(session.token(a, "fake-token-987654321") && !session.current(prior));
        check(!session.requested(prior, "late-request-token-12345")); // rotation wins
        NativePushSession.State rotated = state[0];
        check(session.scope("")); check(state[0].token.isEmpty());
        check(!session.token(a, "late-fake-token-123456") && !session.current(rotated));
        check(session.scope("B")); check(!session.token(a, "late-fake-token-123456"));
        check(session.token(state[0].generation, "fake-token-account-B"));
        check(!session.token(state[0].generation, "bad token"));
        fail[0] = true; check(!session.scope("")); fail[0] = false;
        check(session.scope("") && state[0].token.isEmpty());
        check(!session.scope("wrong owner@"));
        System.out.println("PASS native enrollment state: " + cases + " synthetic cases; no SDK/network/device");
    }
}
