import Debug "mo:base/Debug";
import Principal "mo:base/Principal";
import Array "mo:base/Array";
import Prim "mo:prim";
import Cycles "mo:base/ExperimentalCycles";
import Nat "mo:base/Nat";

module {
  public type ExternalBlob = Blob;

  public type State = {
    var blobTodeletete : [Blob];
    var authorizedPrincipals : [Principal];
  };

  public func new() : State {
    let authorizedPrincipals : [Principal] = [];
    let blobTodeletete : [Blob] = [];
    {
      var authorizedPrincipals;
      var blobTodeletete;
    };
  };

  public func getCashierPrincipal() : async Principal {
    switch (Prim.envVar<system>("CAFFFEINE_STORAGE_CASHIER_PRINCIPAL")) {
      case (null) {
        Debug.trap("CAFFFEINE_STORAGE_CASHIER_PRINCIPAL environment variable is not set");
      };
      case (?cashierPrincipal) {
        Principal.fromText(cashierPrincipal);
      };
    };
  };

  // Authorization functions
  public func updateGatewayPrincipals(registry : State) : async () {
    let cashierActor = actor (Principal.toText(await getCashierPrincipal())) : actor {
      storage_gateway_principal_list_v1 : () -> async [Principal];
    };

    registry.authorizedPrincipals := await cashierActor.storage_gateway_principal_list_v1();
  };

  public func isAuthorized(registry : State, caller : Principal) : Bool {
    let authorized = Array.find<Principal>(
      registry.authorizedPrincipals,
      func(p) {
        Principal.equal(p, caller);
      }
    ) != null;
    authorized;
  };

  public func refillCashier(
    _registry : State,
    cashier : Principal,
    refillInformation : ?{
      proposed_top_up_amount : ?Nat;
    }
  ) : async {
    success : ?Bool;
    topped_up_amount : ?Nat;
  } {
    let currentBalance = Cycles.balance();
    let reservedCycles : Nat = 400_000_000_000;

    let currentFreeCyclesCount : Nat = Nat.sub(currentBalance, reservedCycles);

    let cyclesToSend : Nat = switch (refillInformation) {
      case (null) { currentFreeCyclesCount };
      case (?info) {
        switch (info.proposed_top_up_amount) {
          case (null) { currentFreeCyclesCount };
          case (?proposed) { Nat.min(proposed, currentFreeCyclesCount) };
        };
      };
    };

    let targetCanister = actor (Principal.toText(cashier)) : actor {
      account_top_up_v1 : ({ account : Principal }) -> async ();
    };

    await (with cycles = cyclesToSend) targetCanister.account_top_up_v1({ account = Prim.getSelfPrincipal<system>() });

    {
      success = ?true;
      topped_up_amount = ?cyclesToSend;
    };
  };
};
