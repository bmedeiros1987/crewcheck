package com.crewcheck.watch;
import java.security.SecureRandom;
import java.util.Set;
public final class OperationalReplayFenceHarness {
    static int checks;
    static String h(String s) { return s.repeat(64); }
    static void ok(boolean v) { checks++; if (!v) throw new AssertionError("check " + checks); }
    public static void main(String[] args) throws Exception {
        final OperationalReplayFence.State[] disk = {OperationalReplayFence.State.empty()};
        final String[] cache = {null};
        final boolean[] fail = {false};
        OperationalReplayFence.Commit commit = (next, raw) -> {
            if (fail[0]) throw new Exception("disk failure");
            disk[0] = next;
            if (!OperationalReplayFence.KEEP_CACHE.equals(raw)) cache[0] = raw;
        };
        var f = new OperationalReplayFence(disk[0], commit, new SecureRandom());
        var nodes = Set.of("phone");
        ok(f.challenge("phone", h("1"), h("2"), Set.of()) == null);
        ok(f.challenge("phone", h("1"), h("2"), Set.of("phone","other")) == null);
        var a = f.challenge("phone", h("1"), h("2"), nodes);
        ok(a.equals(disk[0].pending()));
        ok(f.snapshot("phone",a.lease(),1,h("a"),"gate A12",1,100,2)==OperationalReplayFence.Result.REJECTED);
        ok(f.admit(a,nodes)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.snapshot("phone",a.lease(),1,h("a"),"gate A12",1,100,2)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.admit(a,nodes)==OperationalReplayFence.Result.DUPLICATE && "gate A12".equals(cache[0]));
        ok(f.snapshot("phone",a.lease(),1,h("a"),"gate A12",1,100,3)==OperationalReplayFence.Result.DUPLICATE);
        ok(f.snapshot("phone",a.lease(),1,h("b"),"gate B",1,100,3)==OperationalReplayFence.Result.REJECTED);
        ok(f.snapshot("other",a.lease(),2,h("b"),"gate B",1,100,3)==OperationalReplayFence.Result.REJECTED);
        ok(f.snapshot("phone",a.lease(),2,h("b"),"gate B",1,100,100)==OperationalReplayFence.Result.REJECTED);
        f = new OperationalReplayFence(disk[0],commit,new SecureRandom());
        ok(f.snapshot("phone",a.lease(),1,h("a"),"gate A12",1,100,4)==OperationalReplayFence.Result.DUPLICATE);
        var b=f.challenge("phone",h("3"),h("4"),nodes);
        f.connectionChanged(Set.of());
        ok(f.admit(b,nodes)==OperationalReplayFence.Result.REJECTED);
        b=f.challenge("phone",h("3"),h("4"),nodes);
        ok(f.admit(b,nodes)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.admit(a,nodes)==OperationalReplayFence.Result.REJECTED);
        ok(f.snapshot("phone",a.lease(),5,h("a"),"old",1,100,4)==OperationalReplayFence.Result.REJECTED);
        f.clear();
        ok(f.admit(b,nodes)==OperationalReplayFence.Result.REJECTED);
        ok(f.challenge("phone",b.request(),b.lease(),nodes)==null);
        ok(disk[0].revoked() && cache[0]==null);
        f=new OperationalReplayFence(OperationalReplayFence.State.empty(),commit,new SecureRandom());
        ok(f.admit(a,nodes)==OperationalReplayFence.Result.REJECTED);
        var c=f.challenge("phone",h("5"),h("6"),nodes);
        fail[0]=true;
        try { f.admit(c,nodes); throw new AssertionError(); } catch(Exception expected) {}
        ok(f.state().active()==null);
        fail[0]=false;
        ok(f.admit(c,nodes)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.snapshot("phone",c.lease(),2,h("b"),"current",1,100,5)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.snapshot("phone",c.lease(),1,h("a"),"old",1,100,5)==OperationalReplayFence.Result.REJECTED);
        // Known contract gap: legacy empty v1 expires immediately and is rejected,
        // so local-only phone revocation cannot remotely clear already accepted data.
        ok(f.snapshot("phone",c.lease(),3,h("c"),"session-invalidated",6,6,6)==OperationalReplayFence.Result.REJECTED);
        ok("current".equals(cache[0]));
        System.out.println("Counterexample confirmed: expired empty alone cannot revoke; dedicated revoke tested below");
        var revoke=new OperationalReplayFence.Revocation("phone",c.lease(),3,h("7"));
        fail[0]=true;
        try {f.revoke(revoke,h("d"));throw new AssertionError();}catch(Exception expected){}
        ok(!f.state().revoked() && "current".equals(cache[0]));
        fail[0]=false;
        ok(f.revoke(revoke,h("d"))==OperationalReplayFence.RevokeResult.CLEARED && cache[0]==null);
        f=new OperationalReplayFence(disk[0],commit,new SecureRandom());
        ok(f.revoke(revoke,h("d"))==OperationalReplayFence.RevokeResult.CLEARED);
        ok(f.snapshot("phone",c.lease(),999,h("e"),"replay",1,100,7)==OperationalReplayFence.Result.REJECTED);
        var d=f.challenge("phone",h("8"),h("9"),nodes);
        ok(f.admit(d,nodes)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.snapshot("phone",d.lease(),1,h("e"),"gate manual B99",1,100,7)==OperationalReplayFence.Result.ACCEPTED);
        ok(f.revoke(revoke,h("d"))==OperationalReplayFence.RevokeResult.NOT_CURRENT);
        ok("gate manual B99".equals(cache[0]));
        var pending=f.challenge("phone",h("a"),h("b"),nodes);
        var pendingRevoke=new OperationalReplayFence.Revocation("phone",pending.lease(),1,h("c"));
        ok(f.revoke(pendingRevoke,h("d"))==OperationalReplayFence.RevokeResult.NOT_CURRENT);
        ok(f.admit(pending,nodes)==OperationalReplayFence.Result.REJECTED);
        ok("gate manual B99".equals(cache[0]));
        pending=f.challenge("phone",h("a"),h("b"),nodes);
        ok(f.revoke(revoke,h("d"))==OperationalReplayFence.RevokeResult.NOT_CURRENT);
        ok(f.state().pending().equals(pending));
        System.out.println("OperationalReplayFence: " + checks + " assertions PASS (pure JVM, no device/network)");
    }
}
