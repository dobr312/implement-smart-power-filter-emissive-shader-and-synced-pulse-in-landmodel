import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Float "mo:core/Float";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import AccessControl "authorization/access-control";



actor CyberGenesisLandMint {

  let accessControlState = AccessControl.initState();

  // ── Stable-compatible migration stubs (kept for upgrade compatibility) ──
  public type UserProfile = { name : Text };
  public type Modification = { mod_id : Nat; rarity_tier : Nat; multiplier_value : Float; model_url : Text };
  public type EnergyBooster = { amount : Nat };
  public type ConsumableBuff = { buff_type : Text; duration : Nat };
  public type Coordinates = { lat : Float; lon : Float };

  let userProfiles = Map.empty<Principal, UserProfile>();
  let modifications = Map.empty<Principal, [Modification]>();
  let energyBoosters = Map.empty<Principal, [EnergyBooster]>();
  let consumableBuffs = Map.empty<Principal, [ConsumableBuff]>();
  var nextModId : Nat = 0;
  let DISCOVERY_CHARGE_COST : Nat = 20;
  let DISCOVERY_CBR_COST : Nat = 500;
  let DISCOVERY_ICP_COST : Nat = 100000000;
  let authorizedAdminPrincipal : Principal = Principal.fromText("whd5e-pbxhk-pp65k-hxqqx-edtrx-5b7xd-itunf-pz5f5-bzjut-dxkhy-4ae");
  // ── End migration stubs ──

  public type LandData = {
    principal : Principal;
    coordinates : Coordinates;
    biome : Text;
    upgradeLevel : Nat;
    lastClaimTime : Time.Time;
    plotName : Text;
    decorationURL : ?Text;
    baseTokenMultiplier : Float;
    cycleCharge : Int;
    chargeCap : Nat;
    lastChargeUpdate : Time.Time;
    landId : Nat;
    attachedModifications : [ModifierInstance];
  };

  public type ClaimResult = {
    #success : { tokensClaimed : Nat; newBalance : Nat; nextClaimTime : Time.Time };
    #cooldown : { remainingTime : Int; currentBalance : Nat };
    #insufficientCharge : { required : Nat; current : Int };
    #mintFailed : Text;
  };

  public type UpgradeResult = {
    #success : { newLevel : Nat; remainingTokens : Nat };
    #insufficientTokens : { required : Nat; current : Nat };
    #maxLevelReached;
  };

  public type TopLandEntry = {
    principal : Principal;
    plotName : Text;
    biome : Text;
    upgradeLevel : Nat;
    tokenBalance : Nat;
    landId : Nat;
  };

  public type LootCache = {
    cache_id : Nat;
    tier : Nat;
    owner : Principal;
    discovered_at : Time.Time;
    is_opened : Bool;
  };

  public type DiscoverCacheResult = {
    #success : LootCache;
    #insufficientCharge : { required : Nat; current : Int };
    #insufficientTokens : { required : Nat; current : Nat };
    #paymentFailed : Text;
  };

  public type Modifier = {
    mod_id : Nat;
    rarity_tier : Nat;
    name : Text;
    multiplier_value : Float;
    asset_url : Text;
  };

  public type ModifierInstance = {
    modifierInstanceId : Nat;
    modifierType : Text;
    rarity_tier : Nat;
    multiplier_value : Float;
    model_url : Text;
  };

  public type LandToken = { token_id : Nat; rarity : Text };

  // ── Crystal, Booster & Cache Drop Types ──

  public type CrystalKind = { #Burnite; #Synthex; #Cryonix };
  public type CrystalTier = { #T1; #T2 };
  public type CrystalItem = {
    kind : CrystalKind;
    tier : CrystalTier;
    quantity : Nat;
  };

  public type BoosterKind = { #B250; #B500; #B1000 };
  public type BoosterItem = {
    kind : BoosterKind;
    quantity : Nat;
  };

  public type KeeperHeartItem = {
    biome : Text;
  };

  public type CacheDropMod = {
    modId : Nat;
    rarityTier : Nat;
    subtype : Text;
    instanceId : Nat;
  };

  public type CacheDropItem = {
    #mod : CacheDropMod;
    #crystal : CrystalItem;
    #booster : BoosterItem;
    #keeperHeart : KeeperHeartItem;
  };

  public type CacheOpenResult = {
    items : [CacheDropItem];
    energySpent : Nat;
  };

  public type FullInventory = {
    crystals : [CrystalItem];
    boosters : [BoosterItem];
    keeperHearts : [KeeperHeartItem];
  };

  // ── Marketplace Types ──

  public type ItemType = { #Land; #Modifier };

  public type Listing = {
    listingId : Nat;
    itemId : Nat;
    itemType : ItemType;
    seller : Principal;
    price : Nat;
    isActive : Bool;
    biome : Text;
  };

  // ── State ──

  let landRegistry = Map.empty<Principal, [LandData]>();
  let lootCaches = Map.empty<Principal, [LootCache]>();
  let landTokens = Map.empty<Principal, [LandToken]>();
  let playerInventory = Map.empty<Principal, [ModifierInstance]>();
  let playerCrystals = Map.empty<Principal, [CrystalItem]>();
  let playerBoosters = Map.empty<Principal, [BoosterItem]>();
  let playerKeeperHearts = Map.empty<Principal, [KeeperHeartItem]>();
  let listings = Map.empty<Nat, Listing>();

  var nextCacheId : Nat = 0;
  var nextLandId : Nat = 0;
  var nextModifierInstanceId : Nat = 0;
  var nextListingId : Nat = 0;
  let usedAutoMint = Map.empty<Principal, Bool>();

  var marketplaceCanister : ?Principal = null;
  var governanceCanister : ?Principal = null;
  var tokenCanister : ?Principal = null;

  let CACHE_PROCESS_CHARGE_COST : Nat = 10;

  var modifiers : [Modifier] = [];

  // ── Access Control ──

  public shared ({ caller }) func initializeAccessControl() : async () {
    AccessControl.initialize(accessControlState, caller);
  };

  public query ({ caller }) func getCallerUserRole() : async AccessControl.UserRole {
    AccessControl.getUserRole(accessControlState, caller);
  };

  public shared ({ caller }) func assignCallerUserRole(user : Principal, role : AccessControl.UserRole) : async () {
    AccessControl.assignRole(accessControlState, caller, user, role);
  };

  public query ({ caller }) func isCallerAdmin() : async Bool {
    AccessControl.isAdmin(accessControlState, caller);
  };

  // ── Land Helpers ──

  func hashPrincipal(p : Principal) : Nat {
    let bytes = p.toBlob();
    var hash = 0;
    for (byte in bytes.values()) {
      hash := (hash * 31 + byte.toNat()) % 1000000;
    };
    hash;
  };

  // Weighted biome distribution: Common 55%, Rare 35%, Mythic 10%
  func getBiome(hash : Nat) : Text {
    let r = hash % 100;
    if      (r < 28) { "FOREST_VALLEY" }        // 28%
    else if (r < 55) { "ISLAND_ARCHIPELAGO" }   // 27%
    else if (r < 67) { "SNOW_PEAK" }            // 12%
    else if (r < 79) { "DESERT_DUNE" }          // 12%
    else if (r < 90) { "VOLCANIC_CRAG" }        // 11%
    else if (r < 95) { "MYTHIC_VOID" }          // 5%
    else             { "MYTHIC_AETHER" }         // 5%
  };

  func generateCoordinates(hash : Nat) : Coordinates {
    let lat = ((hash % 1800).toFloat() / 10.0) - 90.0;
    let lon = ((hash % 3600).toFloat() / 10.0) - 180.0;
    { lat; lon };
  };

  func getChargeRatePerHour(level : Nat) : Int {
    switch (level) {
      case 0 { 83 };
      case 1 { 83 };
      case 2 { 83 };
      case 3 { 89 };
      case _ { 88 };
    };
  };

  func getChargeCap(level : Nat) : Nat {
    switch (level) {
      case 0 { 1000 };
      case 1 { 1500 };
      case 2 { 2000 };
      case 3 { 2500 };
      case _ { 3500 };
    };
  };

  func updateCharge(data : LandData) : LandData {
    let currentTime = Time.now();
    let elapsedTime = currentTime - data.lastChargeUpdate;
    let hoursElapsed = elapsedTime / 3_600_000_000_000;
    let chargePerHour = getChargeRatePerHour(data.upgradeLevel);
    let cap : Int = data.chargeCap;
    let newCharge = if (data.cycleCharge + hoursElapsed * chargePerHour > cap) { cap }
                   else { data.cycleCharge + hoursElapsed * chargePerHour };
    { data with cycleCharge = newCharge; lastChargeUpdate = currentTime };
  };

  // ── Land Management ──

  public shared ({ caller }) func getLandData() : async [LandData] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access land data");
    };
    switch (landRegistry.get(caller)) {
      case (?existingLands) { existingLands };
      case null {
        let hash = hashPrincipal(caller);
        let coordinates = generateCoordinates(hash);
        let biome = getBiome(hash);
        let finalBiome = biome;
        let baseTokenMultiplier = 1.0;
        let newLand : LandData = {
          principal = caller;
          coordinates;
          biome = finalBiome;
          upgradeLevel = 0;
          lastClaimTime = 0;
          plotName = "My Plot";
          decorationURL = null;
          baseTokenMultiplier;
          cycleCharge = 600;   // Starter energy bonus for new users
          chargeCap = 1000;
          lastChargeUpdate = Time.now();
          landId = nextLandId;
          attachedModifications = [];
        };
        nextLandId += 1;
        landRegistry.add(caller, [newLand]);
        [newLand];
      };
    };
  };

  public shared ({ caller }) func mintLand() : async LandData {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can mint new land");
    };
    let userTokens = switch (landTokens.get(caller)) {
      case (?tokens) { tokens };
      case null { [] };
    };
    if (userTokens.size() == 0) { Runtime.trap("No LandTokens available") };
    let remainingTokens = Array.tabulate(userTokens.size() - 1, func(i : Nat) : LandToken {
      if (i < userTokens.size() - 1) { userTokens[i] } else { userTokens[i + 1] };
    });
    landTokens.add(caller, remainingTokens);
    let hash = hashPrincipal(caller) + nextLandId;
    let coordinates = generateCoordinates(hash);
    let biome = getBiome(hash);
    let finalBiome = biome;
    let baseTokenMultiplier = 1.0;
    let newLand : LandData = {
      principal = caller;
      coordinates;
      biome = finalBiome;
      upgradeLevel = 0;
      lastClaimTime = 0;
      plotName = "My Plot";
      decorationURL = null;
      baseTokenMultiplier;
      cycleCharge = 0;
      chargeCap = 1000;
      lastChargeUpdate = Time.now();
      landId = nextLandId;
      attachedModifications = [];
    };
    nextLandId += 1;
    let userLands = switch (landRegistry.get(caller)) {
      case (?lands) { lands };
      case null { [] };
    };
    landRegistry.add(caller, ([userLands, [newLand]]).flatten());
    newLand;
  };

  public shared ({ caller }) func claimRewards(landId : Nat) : async ClaimResult {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can claim rewards");
    };
    let cyberTokenCanister = switch (tokenCanister) {
      case null { Runtime.trap("Configuration error: Token canister not set.") };
      case (?canisterId) {
        actor (canisterId.toText()) : actor { mint : (Principal, Nat) -> async () };
      };
    };
    let currentTime = Time.now();
    let dayInNanos = 86_400_000_000_000;
    switch (landRegistry.get(caller)) {
      case null { Runtime.trap("Land not found for principal") };
      case (?lands) {
        var landIndex : ?Nat = null;
        var i = 0;
        for (land in lands.vals()) {
          if (land.landId == landId) { landIndex := ?i };
          i += 1;
        };
        switch (landIndex) {
          case null { Runtime.trap("Land with ID " # landId.toText() # " not found") };
          case (?index) {
            let land = lands[index];
            let updatedLand = updateCharge(land);
            if (updatedLand.cycleCharge < 10) {
              return #insufficientCharge { required = 10; current = updatedLand.cycleCharge };
            };
            let timeSinceLastClaim = currentTime - updatedLand.lastClaimTime;
            if (timeSinceLastClaim < dayInNanos) {
              let remainingTime = dayInNanos - timeSinceLastClaim;
              return #cooldown { remainingTime; currentBalance = 0 };
            };
            let baseReward = 100 * (updatedLand.upgradeLevel + 1);
            let rewardF = baseReward.toFloat() * updatedLand.baseTokenMultiplier;
            let reward = Int.abs(rewardF.toInt());
            try {
              await cyberTokenCanister.mint(caller, reward);
            } catch (_error) {
              return #mintFailed("Failed to mint tokens");
            };
            let finalLand = { updatedLand with lastClaimTime = currentTime; cycleCharge = updatedLand.cycleCharge - 10 };
            let updatedLands = Array.tabulate(lands.size(), func(i : Nat) : LandData {
              if (i == index) { finalLand } else { lands[i] };
            });
            landRegistry.add(caller, updatedLands);
            #success { tokensClaimed = reward; newBalance = 0; nextClaimTime = currentTime + dayInNanos };
          };
        };
      };
    };
  };

  public shared ({ caller }) func upgradePlot(landId : Nat, cost : Nat) : async UpgradeResult {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can upgrade plots");
    };
    switch (landRegistry.get(caller)) {
      case null { Runtime.trap("Land not found for principal") };
      case (?lands) {
        var landIndex : ?Nat = null;
        var i = 0;
        for (land in lands.vals()) {
          if (land.landId == landId) { landIndex := ?i };
          i += 1;
        };
        switch (landIndex) {
          case null { Runtime.trap("Land with ID " # landId.toText() # " not found") };
          case (?index) {
            let land = lands[index];
            let updatedLand = updateCharge(land);
            if (updatedLand.upgradeLevel >= 4) { return #maxLevelReached };
            let newLevel = updatedLand.upgradeLevel + 1;
            let newCap = getChargeCap(newLevel);
            let finalLand = { updatedLand with upgradeLevel = newLevel; chargeCap = newCap };
            let updatedLands = Array.tabulate(lands.size(), func(i : Nat) : LandData {
              if (i == index) { finalLand } else { lands[i] };
            });
            landRegistry.add(caller, updatedLands);
            #success { newLevel; remainingTokens = 0 };
          };
        };
      };
    };
  };

  public query ({ caller }) func getLandDataQuery() : async ?[LandData] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can query land data");
    };
    landRegistry.get(caller);
  };

  public type PublicLandInfo = {
    landId : Nat;
    biome : Text;
    principal : Principal;
  };

  public query func getAllLandsPublic() : async [PublicLandInfo] {
    var result : [PublicLandInfo] = [];
    for ((_p, userLands) in landRegistry.entries()) {
      for (land in userLands.vals()) {
        result := ([result, [{ landId = land.landId; biome = land.biome; principal = land.principal }]]).flatten();
      };
    };
    result;
  };

  public query func getLandDataById(landId : Nat) : async ?LandData {
    var found : ?LandData = null;
    label search for ((_p, userLands) in landRegistry.entries()) {
      for (land in userLands.vals()) {
        if (land.landId == landId) {
          found := ?land;
          break search;
        };
      };
    };
    found
  };

  public query ({ caller }) func getLandsByOwner(owner : Principal) : async [LandData] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    switch (landRegistry.get(owner)) {
      case (?lands) { lands };
      case null { [] };
    };
  };

  // ── Canister Config ──

  public shared ({ caller }) func setMarketplaceCanister(marketplace : Principal) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can set marketplace canister");
    };
    marketplaceCanister := ?marketplace;
  };

  public shared ({ caller }) func setGovernanceCanister(governance : Principal) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can set governance canister");
    };
    governanceCanister := ?governance;
  };

  public shared ({ caller }) func setTokenCanister(token : Principal) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can set token canister");
    };
    tokenCanister := ?token;
  };

  // ── NFT Transfer (legacy external, kept for compatibility) ──

  public query func getLandOwner(landId : Nat) : async ?Principal {
    for ((principal, lands) in landRegistry.entries()) {
      for (land in lands.vals()) {
        if (land.landId == landId) { return ?principal };
      };
    };
    null;
  };

  public shared ({ caller }) func transferLand(to : Principal, landId : Nat) : async Bool {
    let marketplace = switch (marketplaceCanister) {
      case null { Runtime.trap("Marketplace canister not configured") };
      case (?m) { m };
    };
    if (caller != marketplace) {
      Runtime.trap("Unauthorized: Only the marketplace canister can transfer land");
    };
    transferLandInternal(to, landId)
  };

  public shared ({ caller }) func transferModifier(from : Principal, to : Principal, modifierInstanceId : Nat) : async Bool {
    let marketplace = switch (marketplaceCanister) {
      case null { Runtime.trap("Marketplace canister not configured") };
      case (?m) { m };
    };
    if (caller != marketplace) {
      Runtime.trap("Unauthorized: Only the marketplace canister can transfer modifiers");
    };
    transferModifierInternal(from, to, modifierInstanceId)
  };

  // ── Internal Transfer Helpers (used by built-in marketplace) ──

  func transferLandInternal(to : Principal, landId : Nat) : Bool {
    for ((principal, lands) in landRegistry.entries()) {
      var landIndex : ?Nat = null;
      var i = 0;
      for (land in lands.vals()) {
        if (land.landId == landId) { landIndex := ?i };
        i += 1;
      };
      switch (landIndex) {
        case null {};
        case (?index) {
          let updatedLands = Array.tabulate(lands.size() - 1, func(i : Nat) : LandData {
            if (i < index) { lands[i] } else { lands[i + 1] };
          });
          landRegistry.add(principal, updatedLands);
          let newLand = { lands[index] with principal = to };
          let toLands = switch (landRegistry.get(to)) {
            case (?l) { l };
            case null { [] };
          };
          landRegistry.add(to, ([toLands, [newLand]]).flatten());
          let sellerRemaining = switch (landRegistry.get(principal)) {
            case (?l) { l };
            case null { [] };
          };
          if (sellerRemaining.size() == 0) {
            switch (usedAutoMint.get(principal)) {
              case (?_) {
                landRegistry.add(principal, [lands[index]]);
                return false;
              };
              case null {
                let hash = hashPrincipal(principal) + nextLandId;
                let coords = generateCoordinates(hash);
                let safetyBiome = if (hash % 2 == 0) { "FOREST_VALLEY" } else { "ISLAND_ARCHIPELAGO" };
                let autoLand : LandData = {
                  principal = principal;
                  coordinates = coords;
                  biome = safetyBiome;
                  upgradeLevel = 0;
                  lastClaimTime = 0;
                  plotName = "My Plot";
                  decorationURL = null;
                  baseTokenMultiplier = 1.0;
                  cycleCharge = 0;
                  chargeCap = 1000;
                  lastChargeUpdate = Time.now();
                  landId = nextLandId;
                  attachedModifications = [];
                };
                nextLandId += 1;
                landRegistry.add(principal, [autoLand]);
                usedAutoMint.add(principal, true);
              };
            };
          };
          return true;
        };
      };
    };
    false;
  };

  func transferModifierInternal(from : Principal, to : Principal, modifierInstanceId : Nat) : Bool {
    let fromInventory = switch (playerInventory.get(from)) {
      case (?inv) { inv };
      case null { return false };
    };
    var modIdx : ?Nat = null;
    var mi = 0;
    for (mod in fromInventory.vals()) {
      if (mod.modifierInstanceId == modifierInstanceId) { modIdx := ?mi };
      mi += 1;
    };
    switch (modIdx) {
      case null { return false };
      case (?index) {
        let modifier = fromInventory[index];
        let updatedFrom = Array.tabulate(fromInventory.size() - 1, func(i : Nat) : ModifierInstance {
          if (i < index) { fromInventory[i] } else { fromInventory[i + 1] };
        });
        playerInventory.add(from, updatedFrom);
        let toInventory = switch (playerInventory.get(to)) {
          case (?inv) { inv };
          case null { [] };
        };
        playerInventory.add(to, ([toInventory, [modifier]]).flatten());
        return true;
      };
    };
  };

  // ── Built-in Marketplace ──

  public shared ({ caller }) func list_item(itemId : Nat, itemType : ItemType, price : Nat) : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    if (price == 0) { Runtime.trap("Price must be greater than zero") };
    // Check for duplicate active listing of the same item by this caller
    for ((_id, listing) in listings.entries()) {
      if (listing.isActive and listing.seller == caller and listing.itemId == itemId) {
        Runtime.trap("Already listed");
      };
    };
    // Verify ownership and capture biome
    var listingBiome = "";
    switch (itemType) {
      case (#Land) {
        var owns = false;
        let callerLands = switch (landRegistry.get(caller)) { case (?l) { l }; case null { [] } };
        for (land in callerLands.vals()) {
          if (land.landId == itemId) {
            owns := true;
            listingBiome := land.biome;
          };
        };
        if (not owns) { Runtime.trap("You do not own this land") };
        // Block listing last land when auto-mint already used
        if (callerLands.size() == 1) {
          switch (usedAutoMint.get(caller)) {
            case (?true) { Runtime.trap("Last land locked: auto-mint already used") };
            case (_) {};
          };
        };
      };
      case (#Modifier) {
        var owns = false;
        for (mod in (switch (playerInventory.get(caller)) { case (?i) { i }; case null { [] } }).vals()) {
          if (mod.modifierInstanceId == itemId) { owns := true };
        };
        if (not owns) { Runtime.trap("You do not own this modifier") };
      };
    };
    let id = nextListingId;
    nextListingId += 1;
    let newListing : Listing = {
      listingId = id;
      itemId;
      itemType;
      seller = caller;
      price;
      isActive = true;
      biome = listingBiome;
    };
    listings.add(id, newListing);
    id
  };

  public shared ({ caller }) func buy_item(listingId : Nat) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let listing = switch (listings.get(listingId)) {
      case null { Runtime.trap("Listing not found") };
      case (?l) { l };
    };
    if (not listing.isActive) { Runtime.trap("Listing is not active") };
    if (listing.seller == caller) { Runtime.trap("Cannot buy your own listing") };
    // Deactivate listing
    listings.add(listingId, { listing with isActive = false });
    // Transfer item
    switch (listing.itemType) {
      case (#Land) {
        let ok = transferLandInternal(caller, listing.itemId);
        if (not ok) { Runtime.trap("Land transfer failed") };
      };
      case (#Modifier) {
        let ok = transferModifierInternal(listing.seller, caller, listing.itemId);
        if (not ok) { Runtime.trap("Modifier transfer failed") };
      };
    };
    true
  };

  public shared ({ caller }) func cancelListing(listingId : Nat) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let listing = switch (listings.get(listingId)) {
      case null { Runtime.trap("Listing not found") };
      case (?l) { l };
    };
    if (listing.seller != caller) { Runtime.trap("Only the seller can cancel") };
    if (not listing.isActive) { Runtime.trap("Listing is already inactive") };
    listings.add(listingId, { listing with isActive = false });
    true
  };

  public query func getAllActiveListings() : async [Listing] {
    var result : [Listing] = [];
    for ((_id, listing) in listings.entries()) {
      if (listing.isActive) {
        result := ([result, [listing]]).flatten();
      };
    };
    result
  };

  public query func getUserListings(user : Principal) : async [Listing] {
    var result : [Listing] = [];
    for ((_id, listing) in listings.entries()) {
      if (listing.seller == user) {
        result := ([result, [listing]]).flatten();
      };
    };
    result
  };

  public query func getActiveListing(listingId : Nat) : async ?Listing {
    switch (listings.get(listingId)) {
      case null { null };
      case (?l) { if (l.isActive) { ?l } else { null } };
    }
  };

  // ── Admin Land Data ──

  public query ({ caller }) func adminGetLandData(user : Principal) : async ?[LandData] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can view other users' land data");
    };
    landRegistry.get(user);
  };

  public query ({ caller }) func getTopLands(limit : Nat) : async [TopLandEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can view leaderboard");
    };
    var entries : [TopLandEntry] = [];
    for ((principal, lands) in landRegistry.entries()) {
      for (land in lands.vals()) {
        entries := ([entries, [{ principal; plotName = land.plotName; biome = land.biome; upgradeLevel = land.attachedModifications.size(); tokenBalance = 0; landId = land.landId }]]).flatten();
      };
    };
    let sortedEntries = entries.sort(func(a : TopLandEntry, b : TopLandEntry) : { #less; #equal; #greater } {
      if (a.upgradeLevel > b.upgradeLevel) { #less }
      else if (a.upgradeLevel < b.upgradeLevel) { #greater }
      else if (a.tokenBalance > b.tokenBalance) { #less }
      else if (a.tokenBalance < b.tokenBalance) { #greater }
      else { #equal };
    });
    let resultSize = if (limit < sortedEntries.size()) { limit } else { sortedEntries.size() };
    Array.tabulate(resultSize, func(i : Nat) : TopLandEntry { sortedEntries[i] });
  };

  // ── Loot Cache ──

  public shared ({ caller }) func discoverLootCache(tier : Nat) : async DiscoverCacheResult {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can discover loot caches");
    };
    let lands = switch (landRegistry.get(caller)) {
      case null { Runtime.trap("Land not found for principal") };
      case (?l) { l };
    };
    let updatedLand = updateCharge(lands[0]);
    let requiredCharge = switch (tier) {
      case 1 { 200 };
      case 2 { 400 };
      case 3 { 800 };
      case _ { Runtime.trap("Invalid tier: must be 1, 2, or 3") };
    };
    if (updatedLand.cycleCharge < requiredCharge) {
      return #insufficientCharge { required = requiredCharge; current = updatedLand.cycleCharge };
    };
    let finalLand = { updatedLand with cycleCharge = updatedLand.cycleCharge - requiredCharge };
    let updatedLands = Array.tabulate(lands.size(), func(i : Nat) : LandData {
      if (i == 0) { finalLand } else { lands[i] };
    });
    landRegistry.add(caller, updatedLands);
    let cacheId = nextCacheId;
    nextCacheId += 1;
    let newCache : LootCache = {
      cache_id = cacheId;
      tier;
      owner = caller;
      discovered_at = Time.now();
      is_opened = false;
    };
    let userCaches = switch (lootCaches.get(caller)) {
      case (?caches) { caches };
      case null { [] };
    };
    lootCaches.add(caller, ([userCaches, [newCache]]).flatten());
    #success(newCache);
  };

  public shared ({ caller }) func processCache(cache_id : Nat) : async ModifierInstance {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can process caches");
    };
    let userCaches = switch (lootCaches.get(caller)) {
      case (?caches) { caches };
      case null { Runtime.trap("No caches found for user") };
    };
    var cacheIndex : ?Nat = null;
    var i = 0;
    for (cache in userCaches.vals()) {
      if (cache.cache_id == cache_id) { cacheIndex := ?i };
      i += 1;
    };
    switch (cacheIndex) {
      case null { Runtime.trap("Cache not found") };
      case (?index) {
        let cache = userCaches[index];
        if (cache.owner != caller) { Runtime.trap("Unauthorized: You don't own this cache") };
        if (cache.is_opened) { Runtime.trap("Cache already opened") };
        let fourHoursInNanos = 14_400_000_000_000;
        let timeSinceDiscovery = Time.now() - cache.discovered_at;
        let canOpenWithTime = timeSinceDiscovery >= fourHoursInNanos;
        if (not canOpenWithTime) {
          let lands = switch (landRegistry.get(caller)) {
            case null { Runtime.trap("Land not found for principal") };
            case (?l) { l };
          };
          let updatedLand = updateCharge(lands[0]);
          if (updatedLand.cycleCharge < CACHE_PROCESS_CHARGE_COST) {
            Runtime.trap("Cache cannot be opened yet: wait for cooldown or have sufficient charge");
          };
          let finalLand = { updatedLand with cycleCharge = updatedLand.cycleCharge - CACHE_PROCESS_CHARGE_COST };
          let updatedLands = Array.tabulate(lands.size(), func(i : Nat) : LandData {
            if (i == 0) { finalLand } else { lands[i] };
          });
          landRegistry.add(caller, updatedLands);
        };
        let randVal = nextModifierInstanceId % 100;
        let tier = switch (cache.tier) {
          case 1 { if (randVal < 90) { 1 } else { 2 } };
          case 2 { if (randVal < 50) { 1 } else if (randVal < 90) { 2 } else { 3 } };
          case 3 { if (randVal < 30) { 1 } else if (randVal < 65) { 2 } else if (randVal < 90) { 3 } else { 4 } };
          case _ { 1 };
        };
        let multiplier = switch (tier) {
          case 1 { 1.1 }; case 2 { 1.25 }; case 3 { 1.5 }; case 4 { 2.0 }; case _ { 1.0 };
        };
        let modelUrl = switch (tier) {
          case 1 { "https://assets.cybergenesis.io/models/tier1.glb" };
          case 2 { "https://assets.cybergenesis.io/models/tier2.glb" };
          case 3 { "https://assets.cybergenesis.io/models/tier3.glb" };
          case 4 { "https://assets.cybergenesis.io/models/tier4.glb" };
          case _ { "https://assets.cybergenesis.io/models/tier1.glb" };
        };
        let modifierInstanceId = nextModifierInstanceId;
        nextModifierInstanceId += 1;
        let newModifierInstance : ModifierInstance = {
          modifierInstanceId;
          modifierType = "GeneratedModifier";
          rarity_tier = tier;
          multiplier_value = multiplier;
          model_url = modelUrl;
        };
        let userInventory = switch (playerInventory.get(caller)) {
          case (?inventory) { inventory };
          case null { [] };
        };
        playerInventory.add(caller, ([userInventory, [newModifierInstance]]).flatten());
        let updatedCache = { cache with is_opened = true };
        let updatedCaches = Array.tabulate(userCaches.size(), func(i : Nat) : LootCache {
          if (i == index) { updatedCache } else { userCaches[i] };
        });
        lootCaches.add(caller, updatedCaches);
        newModifierInstance;
      };
    };
  };

  // ── Modifiers ──

  public shared ({ caller }) func applyModifier(modifierInstanceId : Nat, landId : Nat) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can apply modifiers");
    };
    let userLands = switch (landRegistry.get(caller)) {
      case (?lands) { lands };
      case null { Runtime.trap("No lands found for user") };
    };
    var landIndex : ?Nat = null;
    var i = 0;
    for (land in userLands.vals()) {
      if (land.landId == landId) { landIndex := ?i };
      i += 1;
    };
    switch (landIndex) {
      case null { Runtime.trap("Land with ID " # landId.toText() # " not found") };
      case (?index) {
        let userInventory = switch (playerInventory.get(caller)) {
          case (?inventory) { inventory };
          case null { Runtime.trap("No modifier inventory found for user") };
        };
        var modifierIndex : ?Nat = null;
        var j = 0;
        for (modifier in userInventory.vals()) {
          if (modifier.modifierInstanceId == modifierInstanceId) { modifierIndex := ?j };
          j += 1;
        };
        switch (modifierIndex) {
          case null { Runtime.trap("Modifier with ID " # modifierInstanceId.toText() # " not found in inventory") };
          case (?modIndex) {
            let updatedInventory = Array.tabulate(userInventory.size() - 1, func(i : Nat) : ModifierInstance {
              if (i < modIndex) { userInventory[i] } else { userInventory[i + 1] };
            });
            playerInventory.add(caller, updatedInventory);
            let land = userLands[index];
            if (land.attachedModifications.size() >= 49) {
              Runtime.trap("Slot limit reached: maximum 49 modifiers per land");
            };
            let mod = userInventory[modIndex];
            if (mod.rarity_tier == 5 and mod.modifierType != land.biome) {
              Runtime.trap("Keeper biome mismatch: this Keeper belongs to " # mod.modifierType # " only");
            };
            let updatedLand = { land with
              attachedModifications = ([land.attachedModifications, [userInventory[modIndex]]]).flatten();
            };
            let updatedLands = Array.tabulate(userLands.size(), func(i : Nat) : LandData {
              if (i == index) { updatedLand } else { userLands[i] };
            });
            landRegistry.add(caller, updatedLands);
          };
        };
      };
    };
  };

  public shared ({ caller }) func removeModifier(landId : Nat, modifierInstanceId : Nat) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can remove modifiers");
    };
    let userLands = switch (landRegistry.get(caller)) {
      case (?lands) { lands };
      case null { Runtime.trap("No lands found for user") };
    };
    var landIndex : ?Nat = null;
    var i = 0;
    for (land in userLands.vals()) {
      if (land.landId == landId) { landIndex := ?i };
      i += 1;
    };
    switch (landIndex) {
      case null { Runtime.trap("Land with ID " # landId.toText() # " not found") };
      case (?index) {
        let land = userLands[index];
        var modifierIndex : ?Nat = null;
        var j = 0;
        for (mod in land.attachedModifications.vals()) {
          if (mod.modifierInstanceId == modifierInstanceId) { modifierIndex := ?j };
          j += 1;
        };
        switch (modifierIndex) {
          case null { Runtime.trap("Modifier with ID " # modifierInstanceId.toText() # " not found on land") };
          case (?modIndex) {
            let removedModifier = land.attachedModifications[modIndex];
            let updatedAttached = Array.tabulate(land.attachedModifications.size() - 1, func(i : Nat) : ModifierInstance {
              if (i < modIndex) { land.attachedModifications[i] } else { land.attachedModifications[i + 1] };
            });
            let updatedLand = { land with attachedModifications = updatedAttached };
            let updatedLands = Array.tabulate(userLands.size(), func(i : Nat) : LandData {
              if (i == index) { updatedLand } else { userLands[i] };
            });
            landRegistry.add(caller, updatedLands);
            let userInventory = switch (playerInventory.get(caller)) {
              case (?inventory) { inventory };
              case null { [] };
            };
            playerInventory.add(caller, ([userInventory, [removedModifier]]).flatten());
          };
        };
      };
    };
  };

  public query ({ caller }) func getMyLootCaches() : async [LootCache] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view their loot caches");
    };
    switch (lootCaches.get(caller)) {
      case (?caches) { caches };
      case null { [] };
    };
  };

  public query ({ caller }) func getMyModifierInventory() : async [ModifierInstance] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view their modifier inventory");
    };
    switch (playerInventory.get(caller)) {
      case (?inventory) { inventory };
      case null { [] };
    };
  };

  // ── DAO Admin Functions ──

  public shared ({ caller }) func adminSetAllModifiers(modifier_list : [Modifier]) : async () {
    switch (governanceCanister) {
      case null { Runtime.trap("Unauthorized: GovernanceCanister not configured.") };
      case (?governance) {
        if (caller != governance) { Runtime.trap("Unauthorized: Only the GovernanceCanister can set all modifiers") };
      };
    };
    if (modifier_list.size() == 0) { Runtime.trap("Invalid modifier list: Must contain at least one modifier") };
    modifiers := modifier_list;
  };

  public query ({ caller }) func getAllModifiers() : async [Modifier] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can view modifier catalog");
    };
    modifiers;
  };

  public query ({ caller }) func getModifierById(mod_id : Nat) : async ?Modifier {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can query modifiers");
    };
    for (modifier in modifiers.vals()) {
      if (modifier.mod_id == mod_id) { return ?modifier };
    };
    null;
  };

  public query ({ caller }) func getModifiersByTier(tier : Nat) : async [Modifier] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can query modifiers by tier");
    };
    modifiers.filter(func(m : Modifier) : Bool { m.rarity_tier == tier })
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Governance: Staking, Proposals, Voting, Rewards, Leaderboard ─────────
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Governance Types ──

  public type GStakeEntry = {
    amount : Nat;
    stakedAt : Time.Time;
    rewardCheckpoint : Nat;
  };

  public type GProposal = {
    id : Nat;
    title : Text;
    description : Text;
    category : Text;
    proposer : Principal;
    createdAt : Time.Time;
    votesYes : Nat;
    votesNo : Nat;
    isActive : Bool;
  };

  public type GVoteRecord = {
    proposalId : Nat;
    choice : Bool;
    weight : Nat;
  };

  public type GVestingEntry = {
    amount : Nat;
    startTime : Time.Time;
    claimed : Nat;
  };

  public type GStakerLeaderboardEntry = {
    principal : Principal;
    stake : Nat;
    weight : Nat;
    topBiome : Text;
    maxMods : Nat;
    unclaimedRewards : Nat;
  };

  public type GStakeInfo = {
    stake : Nat;
    lockEndsAt : Time.Time;
    weight : Nat;
    unclaimedRewards : Nat;
    claimableVest : Nat;
    pendingVest : Nat;
  };

  public type GStakeResult = {
    #success : { newStake : Nat };
    #insufficientTokens : { required : Nat; available : Nat };
    #transferFailed : Text;
  };

  public type GVoteResult = {
    #success : { weight : Nat };
    #proposalNotFound;
    #proposalNotActive;
    #alreadyVoted;
    #notStaker;
  };

  // ── Governance State ──

  let governanceStakes = Map.empty<Principal, GStakeEntry>();
  let governanceVotes = Map.empty<Principal, [GVoteRecord]>();
  let governanceVesting = Map.empty<Principal, GVestingEntry>();
  var governanceProposals : [GProposal] = [];
  var gNextProposalId : Nat = 0;
  var gRewardPerToken : Nat = 0;
  var gTotalWeightedStake : Nat = 0;
  var gTreasuryBalance : Nat = 0;
  var gDeveloperFund : Nat = 0;
  var gInsuranceReserve : Nat = 0;

  let G_REWARD_PRECISION : Nat = 1_000_000_000;
  let G_LOCK_PERIOD_NS : Int = 1_209_600_000_000_000;  // 14 days
  let G_VEST_PERIOD_NS : Int = 604_800_000_000_000;    // 7 days

  // ── Governance Helpers ──

  func getBiomeMultiplierBP(biome : Text) : Nat {
    if (biome == "MYTHIC_VOID" or biome == "MYTHIC_AETHER") { 140 }
    else if (biome == "SNOW_PEAK" or biome == "DESERT_DUNE" or biome == "VOLCANIC_CRAG") { 115 }
    else { 100 }
  };

  func calcWeightInternal(p : Principal, stakeAmount : Nat) : Nat {
    if (stakeAmount == 0) { return 0 };
    let lands = switch (landRegistry.get(p)) {
      case (?l) { l };
      case null { return stakeAmount };
    };
    var maxBiomeBP : Nat = 100;
    var maxMods : Nat = 0;
    var bestRareCount : Nat = 0;
    var bestSpecialCount : Nat = 0;
    var bestUltraCount : Nat = 0;
    var hasKeeper : Bool = false;
    for (land in lands.vals()) {
      let bp = getBiomeMultiplierBP(land.biome);
      if (bp > maxBiomeBP) { maxBiomeBP := bp };
      let mods = land.attachedModifications.size();
      if (mods > maxMods) {
        maxMods := mods;
        var rareCount : Nat = 0;
        var specialCount : Nat = 0;
        var ultraCount : Nat = 0;
        var keeperFound : Bool = false;
        for (mod in land.attachedModifications.vals()) {
          if (mod.rarity_tier == 5) { keeperFound := true }
          else if (mod.rarity_tier == 4) { ultraCount += 1 }
          else if (mod.rarity_tier == 3) { specialCount += 1 }
          else if (mod.rarity_tier == 2) { rareCount += 1 };
        };
        bestRareCount := rareCount;
        bestSpecialCount := specialCount;
        bestUltraCount := ultraCount;
        hasKeeper := keeperFound;
      };
    };
    let baseBP : Nat = 100 + (maxMods * 50 / 99);
    let keeperBP : Nat = if (hasKeeper) { 15 } else { 0 };
    let rareBP : Nat = bestRareCount * 1;
    let specialBP : Nat = bestSpecialCount * 4;
    let ultraBP : Nat = bestUltraCount * 10;
    let modBP : Nat = baseBP + keeperBP + rareBP + specialBP + ultraBP;
    stakeAmount * maxBiomeBP * modBP / 10000
  };

  func calcEarnedRewards(entry : GStakeEntry, weight : Nat) : Nat {
    let diff = if (gRewardPerToken >= entry.rewardCheckpoint) {
      gRewardPerToken - entry.rewardCheckpoint
    } else { 0 };
    weight * diff / G_REWARD_PRECISION
  };

  func calcClaimableVest(p : Principal) : Nat {
    switch (governanceVesting.get(p)) {
      case null { 0 };
      case (?vest) {
        let elapsed : Int = Time.now() - vest.startTime;
        if (elapsed <= 0) { return 0 };
        let elapsedNat : Nat = Int.abs(elapsed);
        let vestPeriodNat : Nat = Int.abs(G_VEST_PERIOD_NS);
        let vested = if (elapsedNat >= vestPeriodNat) {
          vest.amount
        } else {
          vest.amount * elapsedNat / vestPeriodNat
        };
        if (vested > vest.claimed) { vested - vest.claimed } else { 0 }
      };
    }
  };

  func addToVesting(p : Principal, earned : Nat) {
    switch (governanceVesting.get(p)) {
      case null {
        governanceVesting.add(p, { amount = earned; startTime = Time.now(); claimed = 0 });
      };
      case (?prev) {
        let elapsed : Int = Time.now() - prev.startTime;
        if (elapsed >= G_VEST_PERIOD_NS) {
          governanceVesting.add(p, { amount = earned; startTime = Time.now(); claimed = 0 });
        } else {
          governanceVesting.add(p, { prev with amount = prev.amount + earned });
        };
      };
    };
  };

  // ── Staking ──

  public shared ({ caller }) func gStakeTokens(amount : Nat) : async GStakeResult {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let existing = switch (governanceStakes.get(caller)) {
      case (?e) { e };
      case null { { amount = 0; stakedAt = Time.now(); rewardCheckpoint = gRewardPerToken } };
    };
    let weight = calcWeightInternal(caller, existing.amount);
    let earned = calcEarnedRewards(existing, weight);
    if (earned > 0) { addToVesting(caller, earned) };
    let oldWeight = weight;
    let newAmount = existing.amount + amount;
    let newWeight = calcWeightInternal(caller, newAmount);
    gTotalWeightedStake := gTotalWeightedStake + newWeight - oldWeight;
    governanceStakes.add(caller, { amount = newAmount; stakedAt = Time.now(); rewardCheckpoint = gRewardPerToken });
    #success({ newStake = newAmount })
  };

  public shared ({ caller }) func gUnstakeTokens(amount : Nat) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let entry = switch (governanceStakes.get(caller)) {
      case null { Runtime.trap("No stake found") };
      case (?e) { e };
    };
    if (entry.amount < amount) { Runtime.trap("Insufficient staked amount") };
    let elapsed : Int = Time.now() - entry.stakedAt;
    if (elapsed < G_LOCK_PERIOD_NS) { Runtime.trap("Tokens locked for 14 days") };
    let weight = calcWeightInternal(caller, entry.amount);
    let earned = calcEarnedRewards(entry, weight);
    if (earned > 0) { addToVesting(caller, earned) };
    let newAmount = entry.amount - amount;
    let newWeight = calcWeightInternal(caller, newAmount);
    let weightDiff = if (weight > newWeight) { weight - newWeight } else { 0 };
    gTotalWeightedStake := if (gTotalWeightedStake >= weightDiff) { gTotalWeightedStake - weightDiff } else { 0 };
    governanceStakes.add(caller, { amount = newAmount; stakedAt = entry.stakedAt; rewardCheckpoint = gRewardPerToken });
  };

  public shared ({ caller }) func gClaimVestedRewards() : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    switch (governanceStakes.get(caller)) {
      case (?entry) {
        let weight = calcWeightInternal(caller, entry.amount);
        let earned = calcEarnedRewards(entry, weight);
        if (earned > 0) {
          addToVesting(caller, earned);
          governanceStakes.add(caller, { entry with rewardCheckpoint = gRewardPerToken });
        };
      };
      case null {};
    };
    let claimable = calcClaimableVest(caller);
    if (claimable == 0) { return 0 };
    switch (governanceVesting.get(caller)) {
      case null { 0 };
      case (?vest) {
        governanceVesting.add(caller, { vest with claimed = vest.claimed + claimable });
        claimable
      };
    }
  };

  public query ({ caller }) func gGetMyStakeInfo() : async GStakeInfo {
    let entry = switch (governanceStakes.get(caller)) {
      case null {
        return { stake = 0; lockEndsAt = 0; weight = 0; unclaimedRewards = 0; claimableVest = 0; pendingVest = 0 };
      };
      case (?e) { e };
    };
    let weight = calcWeightInternal(caller, entry.amount);
    let earned = calcEarnedRewards(entry, weight);
    let claimable = calcClaimableVest(caller);
    let pendingVest = switch (governanceVesting.get(caller)) {
      case null { 0 };
      case (?v) { if (v.amount > v.claimed) { v.amount - v.claimed } else { 0 } };
    };
    {
      stake = entry.amount;
      lockEndsAt = entry.stakedAt + G_LOCK_PERIOD_NS;
      weight;
      unclaimedRewards = earned;
      claimableVest = claimable;
      pendingVest;
    }
  };

  public query func gGetStakedBalance(p : Principal) : async Nat {
    switch (governanceStakes.get(p)) {
      case null { 0 };
      case (?e) { e.amount };
    }
  };

  public query func gGetTotalWeightedStake() : async Nat { gTotalWeightedStake };

  // ── Income Distribution ──
  // 35% stakers / 20% treasury / 20% developer / 15% burn / 10% insurance

  public shared ({ caller }) func gReceiveIncome(amount : Nat) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can distribute income");
    };
    let stakersShare   = amount * 35 / 100;
    let treasuryShare  = amount * 20 / 100;
    let developerShare = amount * 20 / 100;
    let insuranceShare = amount * 10 / 100;
    // 15% is burned (not recorded)
    gTreasuryBalance  += treasuryShare;
    gDeveloperFund    += developerShare;
    gInsuranceReserve += insuranceShare;
    if (gTotalWeightedStake > 0 and stakersShare > 0) {
      gRewardPerToken += stakersShare * G_REWARD_PRECISION / gTotalWeightedStake;
    };
  };

  public query func gGetTreasuryBalance() : async Nat { gTreasuryBalance };
  public query func gGetDeveloperFund() : async Nat { gDeveloperFund };
  public query func gGetInsuranceReserve() : async Nat { gInsuranceReserve };

  // ── Proposals ──

  public shared ({ caller }) func gCreateProposal(title : Text, description : Text, category : Text) : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized");
    };
    let entry = switch (governanceStakes.get(caller)) {
      case null { Runtime.trap("Must have staked tokens to create proposals") };
      case (?e) { e };
    };
    if (entry.amount == 0) { Runtime.trap("Must have staked tokens to create proposals") };
    let validCategory = category == "treasury" or category == "partnership" or category == "roadmap";
    if (not validCategory) {
      Runtime.trap("Invalid category: must be treasury, partnership, or roadmap");
    };
    let id = gNextProposalId;
    gNextProposalId += 1;
    let newProposal : GProposal = {
      id; title; description; category;
      proposer = caller;
      createdAt = Time.now();
      votesYes = 0; votesNo = 0; isActive = true;
    };
    governanceProposals := ([governanceProposals, [newProposal]]).flatten();
    id
  };

  public shared ({ caller }) func gVote(proposalId : Nat, choice : Bool) : async GVoteResult {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let entry = switch (governanceStakes.get(caller)) {
      case null { return #notStaker };
      case (?e) { if (e.amount == 0) { return #notStaker }; e };
    };
    let weight = calcWeightInternal(caller, entry.amount);
    let myVotes = switch (governanceVotes.get(caller)) {
      case (?v) { v };
      case null { [] };
    };
    for (vote in myVotes.vals()) {
      if (vote.proposalId == proposalId) { return #alreadyVoted };
    };
    var proposalExists = false;
    var proposalActive = false;
    for (p in governanceProposals.vals()) {
      if (p.id == proposalId) {
        proposalExists := true;
        proposalActive := p.isActive;
      };
    };
    if (not proposalExists) { return #proposalNotFound };
    if (not proposalActive) { return #proposalNotActive };
    var newProposals : [GProposal] = [];
    for (p in governanceProposals.vals()) {
      if (p.id == proposalId) {
        let updated = if (choice) { { p with votesYes = p.votesYes + weight } }
                      else { { p with votesNo = p.votesNo + weight } };
        newProposals := ([newProposals, [updated]]).flatten();
      } else {
        newProposals := ([newProposals, [p]]).flatten();
      };
    };
    governanceProposals := newProposals;
    governanceVotes.add(caller, ([myVotes, [{ proposalId; choice; weight }]]).flatten());
    #success({ weight })
  };

  public query func gGetAllProposals() : async [GProposal] {
    governanceProposals
  };

  public query func gGetActiveProposals() : async [GProposal] {
    governanceProposals.filter(func(p : GProposal) : Bool { p.isActive })
  };

  public query ({ caller }) func gGetMyVotes() : async [GVoteRecord] {
    switch (governanceVotes.get(caller)) {
      case (?v) { v };
      case null { [] };
    }
  };

  // ── Leaderboard ──

  public query func gGetLeaderboard(limit : Nat) : async [GStakerLeaderboardEntry] {
    var entries : [GStakerLeaderboardEntry] = [];
    for ((p, entry) in governanceStakes.entries()) {
      if (entry.amount > 0) {
        let lands = switch (landRegistry.get(p)) {
          case (?l) { l };
          case null { [] };
        };
        var maxBiomeBP : Nat = 100;
        var topBiome : Text = "ISLAND_ARCHIPELAGO";
        var maxMods : Nat = 0;
        for (land in lands.vals()) {
          let bp = getBiomeMultiplierBP(land.biome);
          if (bp > maxBiomeBP) { maxBiomeBP := bp; topBiome := land.biome };
          let mods = land.attachedModifications.size();
          if (mods > maxMods) { maxMods := mods };
        };
        let weight = calcWeightInternal(p, entry.amount);
        let unclaimedRewards = calcEarnedRewards(entry, weight);
        entries := ([entries, [{ principal = p; stake = entry.amount; weight; topBiome; maxMods; unclaimedRewards }]]).flatten();
      };
    };
    let sorted = entries.sort(func(a : GStakerLeaderboardEntry, b : GStakerLeaderboardEntry) : { #less; #equal; #greater } {
      if (a.weight > b.weight) { #less }
      else if (a.weight < b.weight) { #greater }
      else { #equal }
    });
    let size = if (limit < sorted.size()) { limit } else { sorted.size() };
    Array.tabulate(size, func(i : Nat) : GStakerLeaderboardEntry { sorted[i] })
  };

  public query ({ caller }) func gCalcWeight(p : Principal) : async Nat {
    switch (governanceStakes.get(p)) {
      case null { 0 };
      case (?e) { calcWeightInternal(p, e.amount) };
    }
  };

  // ── Admin ──

  public shared ({ caller }) func gAdminCloseProposal(proposalId : Nat) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can close proposals");
    };
    var newProposals : [GProposal] = [];
    for (p in governanceProposals.vals()) {
      if (p.id == proposalId) {
        newProposals := ([newProposals, [{ p with isActive = false }]]).flatten();
      } else {
        newProposals := ([newProposals, [p]]).flatten();
      };
    };
    governanceProposals := newProposals;
  };

  public shared ({ caller }) func gAdminWithdrawTreasury(amount : Nat) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can withdraw treasury");
    };
    if (amount > gTreasuryBalance) { Runtime.trap("Insufficient treasury balance") };
    gTreasuryBalance := gTreasuryBalance - amount;
  };

  // ── Cache Drop Helpers ──

  func rollRandom(seed : Nat, salt : Nat) : Nat {
    let a = seed * 1664525 + 1013904223;
    let b = a + salt * 22695477 + 1;
    (b * 6364136 + salt + 1) % 1000
  };

  let commonOrdinary : [Nat] = [1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 14];
  let commonSpecial  : [Nat] = [3, 8, 13];
  let commonUltra    : [Nat] = [15];
  let rareOrdinary   : [Nat] = [17, 18, 19, 20, 21, 23, 26, 27, 28, 29];
  let rareSpecial    : [Nat] = [16, 22, 24, 25];
  let rareUltra      : [Nat] = [30];
  let legendaryOrdinary : [Nat] = [33, 34, 35, 36, 37, 38, 40];
  let legendarySpecial  : [Nat] = [31, 32, 41];
  let legendaryUltra    : [Nat] = [39, 42];
  let mythicOrdinary : [Nat] = [43, 44, 46];
  let mythicSpecial  : [Nat] = [47, 48];
  let mythicUltra    : [Nat] = [45];

  func pickModFromPool(pool : [Nat], seed : Nat) : Nat {
    if (pool.size() == 0) { 1 }
    else { pool[seed % pool.size()] }
  };

  func pickModId(rarityTier : Nat, seed : Nat, salt : Nat) : (Nat, Text) {
    let r = rollRandom(seed, salt + 1000);
    switch (rarityTier) {
      case 1 {
        if      (r < 820) { (pickModFromPool(commonOrdinary, seed + salt), "ordinary") }
        else if (r < 985) { (pickModFromPool(commonSpecial,  seed + salt), "special") }
        else             { (pickModFromPool(commonUltra,    seed + salt), "ultra") }
      };
      case 2 {
        if      (r < 820) { (pickModFromPool(rareOrdinary, seed + salt), "ordinary") }
        else if (r < 985) { (pickModFromPool(rareSpecial,  seed + salt), "special") }
        else             { (pickModFromPool(rareUltra,    seed + salt), "ultra") }
      };
      case 3 {
        if      (r < 820) { (pickModFromPool(legendaryOrdinary, seed + salt), "ordinary") }
        else if (r < 985) { (pickModFromPool(legendarySpecial,  seed + salt), "special") }
        else             { (pickModFromPool(legendaryUltra,    seed + salt), "ultra") }
      };
      case _ {
        if      (r < 820) { (pickModFromPool(mythicOrdinary, seed + salt), "ordinary") }
        else if (r < 985) { (pickModFromPool(mythicSpecial,  seed + salt), "special") }
        else             { (pickModFromPool(mythicUltra,    seed + salt), "ultra") }
      };
    }
  };

  func getRarityTierForCacheTier(cacheTier : Nat, seed : Nat) : Nat {
    let r = rollRandom(seed, 7777);
    switch (cacheTier) {
      case 1 {
        if      (r < 948) { 1 }
        else if (r < 998) { 2 }
        else              { 3 }
      };
      case 2 {
        if      (r < 700) { 1 }
        else if (r < 950) { 2 }
        else if (r < 998) { 3 }
        else              { 4 }
      };
      case 3 {
        if      (r < 380) { 1 }
        else if (r < 830) { 2 }
        else if (r < 992) { 3 }
        else              { 4 }
      };
      case _ { 1 };
    }
  };

  func getCrystalDrop(cacheTier : Nat, seed : Nat, salt : Nat) : CrystalItem {
    let r = rollRandom(seed, salt + 3333);
    switch (cacheTier) {
      case 1 {
        if      (r < 450) { { kind = #Burnite; tier = #T1; quantity = 1 } }
        else if (r < 770) { { kind = #Synthex; tier = #T1; quantity = 1 } }
        else if (r < 970) { { kind = #Cryonix; tier = #T1; quantity = 1 } }
        else if (r < 990) { { kind = #Burnite; tier = #T2; quantity = 1 } }
        else if (r < 997) { { kind = #Synthex; tier = #T2; quantity = 1 } }
        else              { { kind = #Cryonix; tier = #T2; quantity = 1 } }
      };
      case 2 {
        if      (r < 320) { { kind = #Burnite; tier = #T1; quantity = 1 } }
        else if (r < 600) { { kind = #Synthex; tier = #T1; quantity = 1 } }
        else if (r < 850) { { kind = #Cryonix; tier = #T1; quantity = 1 } }
        else if (r < 930) { { kind = #Burnite; tier = #T2; quantity = 1 } }
        else if (r < 980) { { kind = #Synthex; tier = #T2; quantity = 1 } }
        else              { { kind = #Cryonix; tier = #T2; quantity = 1 } }
      };
      case _ {
        if      (r < 240) { { kind = #Burnite; tier = #T1; quantity = 1 } }
        else if (r < 460) { { kind = #Synthex; tier = #T1; quantity = 1 } }
        else if (r < 740) { { kind = #Cryonix; tier = #T1; quantity = 1 } }
        else if (r < 880) { { kind = #Burnite; tier = #T2; quantity = 1 } }
        else if (r < 970) { { kind = #Synthex; tier = #T2; quantity = 1 } }
        else              { { kind = #Cryonix; tier = #T2; quantity = 1 } }
      };
    }
  };

  func getBoosterDrop(cacheTier : Nat, seed : Nat, salt : Nat) : BoosterItem {
    let r = rollRandom(seed, salt + 5555);
    switch (cacheTier) {
      case 1 {
        if      (r < 700) { { kind = #B250; quantity = 1 } }
        else if (r < 970) { { kind = #B500; quantity = 1 } }
        else              { { kind = #B1000; quantity = 1 } }
      };
      case 2 {
        if      (r < 500) { { kind = #B250; quantity = 1 } }
        else if (r < 900) { { kind = #B500; quantity = 1 } }
        else              { { kind = #B1000; quantity = 1 } }
      };
      case _ {
        if      (r < 300) { { kind = #B250; quantity = 1 } }
        else if (r < 800) { { kind = #B500; quantity = 1 } }
        else              { { kind = #B1000; quantity = 1 } }
      };
    }
  };

  let biomeList : [Text] = [
    "FOREST_VALLEY", "ISLAND_ARCHIPELAGO", "SNOW_PEAK",
    "DESERT_DUNE", "VOLCANIC_CRAG", "MYTHIC_VOID", "MYTHIC_AETHER"
  ];

  func addCrystalToInventory(caller : Principal, item : CrystalItem) {
    let existing = switch (playerCrystals.get(caller)) {
      case (?c) { c }; case null { [] };
    };
    var found = false;
    var updated : [CrystalItem] = [];
    for (c in existing.vals()) {
      if (c.kind == item.kind and c.tier == item.tier) {
        updated := ([updated, [{ c with quantity = c.quantity + 1 }]]).flatten();
        found := true;
      } else {
        updated := ([updated, [c]]).flatten();
      };
    };
    if (not found) { updated := ([updated, [item]]).flatten() };
    playerCrystals.add(caller, updated);
  };

  func addBoosterToInventory(caller : Principal, item : BoosterItem) {
    let existing = switch (playerBoosters.get(caller)) {
      case (?b) { b }; case null { [] };
    };
    var found = false;
    var updated : [BoosterItem] = [];
    for (b in existing.vals()) {
      if (b.kind == item.kind) {
        updated := ([updated, [{ b with quantity = b.quantity + 1 }]]).flatten();
        found := true;
      } else {
        updated := ([updated, [b]]).flatten();
      };
    };
    if (not found) { updated := ([updated, [item]]).flatten() };
    playerBoosters.add(caller, updated);
  };

  // ── New Cache Open System ──

  public shared ({ caller }) func openCache(cacheId : Nat) : async CacheOpenResult {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can open caches");
    };
    let userCaches = switch (lootCaches.get(caller)) {
      case (?c) { c }; case null { Runtime.trap("No caches found") };
    };
    var cacheIndex : ?Nat = null;
    var i = 0;
    for (cache in userCaches.vals()) {
      if (cache.cache_id == cacheId) { cacheIndex := ?i };
      i += 1;
    };
    let index = switch (cacheIndex) {
      case null { Runtime.trap("Cache not found") };
      case (?idx) { idx };
    };
    let cache = userCaches[index];
    if (cache.owner != caller) { Runtime.trap("Unauthorized") };
    if (cache.is_opened) { Runtime.trap("Cache already opened") };

    let energyCost : Nat = switch (cache.tier) {
      case 1 { 200 }; case 2 { 400 }; case 3 { 800 }; case _ { 200 };
    };
    let lands = switch (landRegistry.get(caller)) {
      case null { Runtime.trap("No land found") };
      case (?l) { l };
    };
    let updatedLand = updateCharge(lands[0]);
    if (updatedLand.cycleCharge < energyCost) {
      Runtime.trap("Insufficient energy: need " # energyCost.toText());
    };
    let deductedLand = { updatedLand with cycleCharge = updatedLand.cycleCharge - energyCost };
    let updatedLands = Array.tabulate(lands.size(), func(idx : Nat) : LandData {
      if (idx == 0) { deductedLand } else { lands[idx] };
    });
    landRegistry.add(caller, updatedLands);

    let baseSeed = (hashPrincipal(caller) + nextModifierInstanceId * 7919 + (Int.abs(Time.now()) % 999983)) % 999983;

    var items : [CacheDropItem] = [];

    // Slot 1: Mod — 60%/80%/100%
    let modThreshold = switch (cache.tier) { case 1 { 600 }; case 2 { 800 }; case _ { 1000 } };
    let modRoll = rollRandom(baseSeed, 1);
    if (modRoll < modThreshold) {
      let rarityTier = getRarityTierForCacheTier(cache.tier, baseSeed + 11);
      let multiplier = switch (rarityTier) {
        case 1 { 1.1 }; case 2 { 1.25 }; case 3 { 1.5 }; case _ { 2.0 };
      };
      let (modId, subtype) = pickModId(rarityTier, baseSeed, 22);
      let instanceId = nextModifierInstanceId;
      nextModifierInstanceId += 1;
      let newInst : ModifierInstance = {
        modifierInstanceId = instanceId;
        modifierType = "mod_" # modId.toText();
        rarity_tier = rarityTier;
        multiplier_value = multiplier;
        model_url = "";
      };
      let inv = switch (playerInventory.get(caller)) { case (?v) { v }; case null { [] } };
      playerInventory.add(caller, ([inv, [newInst]]).flatten());
      items := ([items, [#mod({ modId; rarityTier; subtype; instanceId })]]).flatten();
    };

    // Slot 2: Booster — 30%/45%/60%
    let boosterThreshold = switch (cache.tier) { case 1 { 300 }; case 2 { 450 }; case _ { 600 } };
    let boosterRoll = rollRandom(baseSeed, 33);
    if (boosterRoll < boosterThreshold) {
      let item = getBoosterDrop(cache.tier, baseSeed, 44);
      addBoosterToInventory(caller, item);
      items := ([items, [#booster(item)]]).flatten();
    };

    // Slot 3: Crystal #1 — 40%/60%/80%
    let crystal1Threshold = switch (cache.tier) { case 1 { 400 }; case 2 { 600 }; case _ { 800 } };
    let crystal1Roll = rollRandom(baseSeed, 55);
    if (crystal1Roll < crystal1Threshold) {
      let item = getCrystalDrop(cache.tier, baseSeed, 66);
      addCrystalToInventory(caller, item);
      items := ([items, [#crystal(item)]]).flatten();
    };

    // Slot 4: Crystal #2 — 10%/25%/45%
    let crystal2Threshold = switch (cache.tier) { case 1 { 100 }; case 2 { 250 }; case _ { 450 } };
    let crystal2Roll = rollRandom(baseSeed, 77);
    if (crystal2Roll < crystal2Threshold) {
      let item = getCrystalDrop(cache.tier, baseSeed + 111, 88);
      addCrystalToInventory(caller, item);
      items := ([items, [#crystal(item)]]).flatten();
    };

    // Slot 5: Keeper Heart — 0%/0%/2%
    if (cache.tier == 3) {
      let heartRoll = rollRandom(baseSeed, 99);
      if (heartRoll < 20) {
        let biomeIdx = (baseSeed + 13) % biomeList.size();
        let heart : KeeperHeartItem = { biome = biomeList[biomeIdx] };
        let existing = switch (playerKeeperHearts.get(caller)) {
          case (?h) { h }; case null { [] };
        };
        playerKeeperHearts.add(caller, ([existing, [heart]]).flatten());
        items := ([items, [#keeperHeart(heart)]]).flatten();
      };
    };

    let updatedCaches = Array.tabulate(userCaches.size(), func(idx : Nat) : LootCache {
      if (idx == index) { { cache with is_opened = true } } else { userCaches[idx] }
    });
    lootCaches.add(caller, updatedCaches);

    { items; energySpent = energyCost }
  };

  public shared ({ caller }) func useBooster(boosterKind : BoosterKind) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized");
    };
    let existing = switch (playerBoosters.get(caller)) {
      case (?b) { b }; case null { Runtime.trap("No boosters") };
    };
    var found = false;
    var updated : [BoosterItem] = [];
    for (b in existing.vals()) {
      if (b.kind == boosterKind and not found) {
        if (b.quantity == 0) { Runtime.trap("No boosters of this type") };
        found := true;
        if (b.quantity > 1) {
          updated := ([updated, [{ b with quantity = b.quantity - 1 }]]).flatten();
        };
      } else {
        updated := ([updated, [b]]).flatten();
      };
    };
    if (not found) { Runtime.trap("Booster not found") };
    playerBoosters.add(caller, updated);

    let boost = switch (boosterKind) { case (#B250) { 250 }; case (#B500) { 500 }; case _ { 1000 } };
    let lands = switch (landRegistry.get(caller)) {
      case null { Runtime.trap("No land") }; case (?l) { l };
    };
    let land = updateCharge(lands[0]);
    let cap : Int = land.chargeCap;
    let newCharge = if (land.cycleCharge + boost > cap) { cap } else { land.cycleCharge + boost };
    let boostedLand = { land with cycleCharge = newCharge };
    landRegistry.add(caller, Array.tabulate(lands.size(), func(idx : Nat) : LandData {
      if (idx == 0) { boostedLand } else { lands[idx] }
    }));
  };

  public query ({ caller }) func getFullInventory() : async FullInventory {
    {
      crystals = switch (playerCrystals.get(caller)) { case (?c) { c }; case null { [] } };
      boosters = switch (playerBoosters.get(caller)) { case (?b) { b }; case null { [] } };
      keeperHearts = switch (playerKeeperHearts.get(caller)) { case (?h) { h }; case null { [] } };
    }
  };

};
