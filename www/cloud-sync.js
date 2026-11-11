/* =====================================================
   SpendWise – cloud-sync.js
   Firebase Firestore Cloud Backup & Sync
   
   Features:
   - Google Sign-In authentication
   - Auto-migration on first launch (localStorage → Firestore)
   - Manual backup to cloud
   - Restore from cloud
   - Real-time sync status indicator
   ===================================================== */

// ─────────────────────────────────────────────────────
// FIREBASE CONFIGURATION
// Replace these values with your own Firebase project config.
// Create a project at: https://console.firebase.google.com
// ─────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  // Copy these exact values from Firebase Console:
  // Project settings → Your apps → Web app → SDK setup and configuration.
  apiKey: "AIzaSyDKtLHw4Ym7gmRt62NCVuj_husMOc7quJ0",
  authDomain: "expenses-tracker-b3763.firebaseapp.com",
  projectId: "expenses-tracker-b3763",
  storageBucket: "expenses-tracker-b3763.firebasestorage.app",
  messagingSenderId: "724764110783",
  appId: "1:724764110783:web:f8aa8a393a808f5f397b0a",
  measurementId: "G-KBNPCYKBHG",
};

// ─────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────
let _firebaseApp = null;
let _db = null;
let _auth = null;
let _currentUser = null;
let _syncInProgress = false;
let _syncQueued = false;
let _cloudInitialized = false;
let _realtimeUnsubscribe = null;
let _isApplyingCloudChange = false;

// Async Race Condition Protection: Session Token & UID tracking
let _currentSessionId = 0;

function getUserStorageKey(uid) {
  if (uid) return `spendwise_v2_${uid}`;
  return "spendwise_v2";
}

function getUserMigrationKey(uid) {
  if (uid) return `spendwise_cloud_migrated_v1_${uid}`;
  return "spendwise_cloud_migrated_v1";
}

function getUserMetaKey(uid) {
  if (uid) return `spendwise_cloud_meta_${uid}`;
  return "spendwise_cloud_meta";
}

const MIGRATION_KEY = "spendwise_cloud_migrated_v1";
const CLOUD_META_KEY = "spendwise_cloud_meta";

// ─────────────────────────────────────────────────────
// FIREBASE INIT (lazy)
// ─────────────────────────────────────────────────────

function isNativeAndroid() {
  try {
    return !!(
      window.Capacitor &&
      typeof window.Capacitor.getPlatform === "function" &&
      window.Capacitor.getPlatform() === "android"
    );
  } catch {
    return false;
  }
}

async function getNativeFirebaseAuthentication() {
  if (!isNativeAndroid()) return null;

  // Capacitor may expose registered plugins through the global bridge.
  const globalPlugin = window.Capacitor?.Plugins?.FirebaseAuthentication;
  if (globalPlugin) return globalPlugin;

  // Fallback for vanilla-JS projects where the plugin proxy is not exposed
  // globally. This does not require a bundler.
  try {
    const mod = await import(
      "https://cdn.jsdelivr.net/npm/@capacitor-firebase/authentication@8.3.0/+esm"
    );
    return mod.FirebaseAuthentication || null;
  } catch (err) {
    console.error(
      "[SpendWise Cloud] Could not load native Firebase Authentication plugin:",
      err,
    );
    return null;
  }
}

async function initFirebase() {
  if (_cloudInitialized) return true;

  if (
    !FIREBASE_CONFIG.apiKey ||
    FIREBASE_CONFIG.apiKey === "YOUR_API_KEY" ||
    !FIREBASE_CONFIG.projectId ||
    FIREBASE_CONFIG.projectId === "YOUR_PROJECT_ID" ||
    !FIREBASE_CONFIG.appId ||
    FIREBASE_CONFIG.appId === "YOUR_APP_ID"
  ) {
    console.warn(
      "[SpendWise Cloud] Firebase Web App config is incomplete. Add the config from Firebase Console.",
    );
    return false;
  }

  try {
    const { initializeApp, getApps } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
    );

    const { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );

    const {
      getAuth,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      signInWithCredential,
      signOut,
      onAuthStateChanged,
    } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
    );

    if (!getApps().length) {
      _firebaseApp = initializeApp(FIREBASE_CONFIG);
    } else {
      _firebaseApp = getApps()[0];
    }

    _db = getFirestore(_firebaseApp);
    _auth = getAuth(_firebaseApp);

    window._fsModules = {
      doc,
      setDoc,
      getDoc,
      onSnapshot,
      collection,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      signInWithCredential,
      signOut,
      onAuthStateChanged,
    };

    _cloudInitialized = true;

    try {
      updateCloudStatus("syncing", "Finalizing Google Sign-in...");
      const result = await getRedirectResult(_auth);
      if (result && result.user) {
        // Success
      }
    } catch (err) {
      console.error("[SpendWise Cloud] Redirect sign-in error:", err);
      const errMsg = err.message || "Unknown redirect error";
      showToast("Redirect login failed: " + errMsg, "error");
      updateCloudStatus("error", "Redirect login failed: " + errMsg);
    }

    onAuthStateChanged(_auth, async (user) => {
      _currentSessionId++;
      const thisSessionId = _currentSessionId;
      const activeUid = user ? user.uid : null;

      _currentUser = user;

      if (typeof setStorageUserUid === "function") {
        setStorageUserUid(activeUid);
      }

      if (typeof loadState === "function") {
        const curScrollY = window.scrollY;
        const prevJson = typeof state !== "undefined" ? JSON.stringify(state) : null;
        loadState();
        const nextJson = typeof state !== "undefined" ? JSON.stringify(state) : null;
        if (prevJson !== nextJson && typeof renderAll === "function") {
          renderAll();
        }
        if (window.scrollY !== curScrollY) {
          window.scrollTo(0, curScrollY);
        }
      }

      updateCloudUI();

      if (user) {
        try {
          await checkAndRunMigration(thisSessionId, activeUid);
        } catch (err) {
          console.error("[SpendWise Cloud] Post-login migration error:", err);
        }
        // Start real-time cross-device sync listener
        setupRealtimeSync(activeUid);
      } else {
        stopRealtimeSync();
      }
    });

    return true;
  } catch (err) {
    console.error("[SpendWise Cloud] Firebase init error:", err);
    updateCloudStatus("error", "Firebase initialization failed.");
    return false;
  }
}

// ─────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────

async function cloudSignIn() {
  updateCloudStatus("signing-in", "Connecting to Google…");

  const ok = await initFirebase();

  if (!ok) {
    updateCloudStatus("error", "Firebase initialization failed.");
    showToast("Firebase initialization failed.", "error");
    return;
  }

  try {
    // Android native Firebase Authentication
    // Active: User has been provided with their SHA-1 array for Firebase integration
    if (isNativeAndroid()) {
      const FirebaseAuthentication = await getNativeFirebaseAuthentication();

      if (!FirebaseAuthentication) {
        throw new Error(
          "Native Firebase Authentication plugin is not available.",
        );
      }

      const result = await FirebaseAuthentication.signInWithGoogle({
        useCredentialManager: false,
      });

      console.log("[SpendWise Cloud] Native Google sign-in result:", result);

      if (
        result &&
        result.credential &&
        (result.credential.idToken || result.credential.accessToken)
      ) {
        const { GoogleAuthProvider, signInWithCredential } = window._fsModules;
        const credential = GoogleAuthProvider.credential(
          result.credential.idToken,
          result.credential.accessToken,
        );
        await signInWithCredential(_auth, credential);
      }

      return;
    }

    // Web fallback
    const { GoogleAuthProvider, signInWithPopup } = window._fsModules;
    const provider = new GoogleAuthProvider();

    // Use Popup instead of Redirect. Now that the domain is whitelisted,
    // it will properly open the Google sign-in mini-tab without losing app state!
    await signInWithPopup(_auth, provider);
  } catch (err) {
    console.error("[SpendWise Cloud] Google sign-in error:", err);

    let errorMsg = err.message || err;
    if (
      typeof errorMsg === "string" &&
      errorMsg.includes("unauthorized-domain")
    ) {
      errorMsg =
        "Unauthorized domain. Please add '" +
        window.location.hostname +
        "' to Firebase Console -> Authentication -> Settings -> Authorized Domains.";
    }

    updateCloudStatus("error", "Sign-in failed: " + errorMsg);

    showToast("Sign-in failed: " + errorMsg, "error");
  }
}

async function cloudSignOut() {
  stopRealtimeSync();
  _currentSessionId++; // Invalidate any pending async operations immediately

  const oldUid = _currentUser ? _currentUser.uid : null;

  if (_auth) {
    try {
      const { signOut } = window._fsModules;

      if (isNativeAndroid()) {
        const FirebaseAuthentication = await getNativeFirebaseAuthentication();

        if (FirebaseAuthentication) {
          try {
            await FirebaseAuthentication.signOut();
          } catch (nativeErr) {
            console.warn("[SpendWise Cloud] Native sign-out warning:", nativeErr);
          }
        }
      }

      await signOut(_auth);
    } catch (err) {
      console.error("[SpendWise Cloud] Sign-out error:", err);
    }
  }

  _currentUser = null;

  // Wipe isolated user storage keys and legacy keys on sign-out
  if (oldUid) {
    localStorage.removeItem(getUserStorageKey(oldUid));
    localStorage.removeItem(getUserMigrationKey(oldUid));
    localStorage.removeItem(getUserMetaKey(oldUid));
  }
  localStorage.removeItem("spendwise_v2");
  localStorage.removeItem(MIGRATION_KEY);
  localStorage.removeItem(CLOUD_META_KEY);

  if (typeof setStorageUserUid === "function") {
    setStorageUserUid(null);
  }

  // Reload empty app state and re-render UI
  if (typeof loadState === "function") {
    loadState();
    if (typeof renderAll === "function") {
      renderAll();
    }
  }

  updateCloudUI();
  showToast("Signed out from cloud backup. Local data cleared.", "info");
}

// ─────────────────────────────────────────────────────
// AUTO-MIGRATION ON FIRST SIGN-IN
// ─────────────────────────────────────────────────────
async function checkAndRunMigration(requestSessionId = null, targetUid = null) {
  if (!_currentUser) return;
  const activeUid = targetUid || _currentUser.uid;
  const activeSessionId = requestSessionId !== null ? requestSessionId : _currentSessionId;

  const migrationKey = getUserMigrationKey(activeUid);
  const alreadyMigrated = localStorage.getItem(migrationKey);
  if (alreadyMigrated) return;

  // Check if user already has cloud data
  const cloudData = await fetchCloudData(activeUid);

  // RACE CONDITION GUARD: Ensure user/session hasn't changed while awaiting cloud data
  if (
    _currentSessionId !== activeSessionId ||
    !_currentUser ||
    _currentUser.uid !== activeUid
  ) {
    console.warn("[SpendWise Cloud] Stale migration fetch discarded for UID:", activeUid);
    return;
  }

  if (cloudData && cloudData.expenses && cloudData.expenses.length > 0) {
    localStorage.setItem(migrationKey, "merged");
    updateCloudStatus(
      "synced",
      `Cloud data found (${cloudData.expenses.length} expenses). Auto-restoring…`,
    );
    await restoreFromCloud(true, activeSessionId, activeUid);
    return;
  }

  // Cloud is empty for this user UID
  const localState = getLocalState(activeUid);
  const legacyRaw = localStorage.getItem("spendwise_v2");
  let dataToPush = localState;

  // Migrate guest data to isolated user storage if localState for this UID is empty
  if (
    (!localState.expenses || localState.expenses.length === 0) &&
    legacyRaw
  ) {
    try {
      const parsedLegacy = JSON.parse(legacyRaw);
      if (parsedLegacy.expenses && parsedLegacy.expenses.length > 0) {
        dataToPush = parsedLegacy;
        localStorage.setItem(getUserStorageKey(activeUid), JSON.stringify(dataToPush));
        if (typeof loadState === "function") {
          loadState();
          if (typeof renderAll === "function") renderAll();
        }
      }
    } catch (e) {}
  }

  const totalItems =
    (dataToPush.expenses?.length || 0) +
    (dataToPush.balanceRecords?.length || 0);

  if (totalItems > 0) {
    updateCloudStatus(
      "syncing",
      `Migrating ${totalItems} local records to cloud…`,
    );
    const success = await pushToCloud(dataToPush, true, activeSessionId, activeUid);
    if (success) {
      localStorage.setItem(migrationKey, "done");
      updateCloudStatus(
        "synced",
        `✅ ${totalItems} records backed up to cloud!`,
      );
      showToast(`☁️ ${totalItems} records auto-backed up to cloud!`, "success");
    }
  } else {
    localStorage.setItem(migrationKey, "done");
    updateCloudStatus("synced", "Cloud backup ready.");
  }
}

// ─────────────────────────────────────────────────────
// CORE CLOUD OPERATIONS
// ─────────────────────────────────────────────────────
function getLocalState(targetUid = null) {
  try {
    const uid = targetUid || (_currentUser ? _currentUser.uid : null);
    const key = getUserStorageKey(uid);
    const raw = localStorage.getItem(key);
    return raw
      ? JSON.parse(raw)
      : { expenses: [], categories: [], balanceRecords: [] };
  } catch {
    return { expenses: [], categories: [], balanceRecords: [] };
  }
}

async function pushToCloud(dataObj, silent = false, requestSessionId = null, targetUid = null) {
  if (!_currentUser || !_db) return false;
  const activeUid = targetUid || _currentUser.uid;
  const activeSessionId = requestSessionId !== null ? requestSessionId : _currentSessionId;

  // RACE CONDITION GUARD
  if (
    _currentSessionId !== activeSessionId ||
    !_currentUser ||
    _currentUser.uid !== activeUid
  ) {
    console.warn("[SpendWise Cloud] Push discarded due to session/UID mismatch.");
    return false;
  }

  if (_syncInProgress) {
    _syncQueued = true;
    return false;
  }
  _syncInProgress = true;
  if (!silent) updateCloudStatus("syncing", "Uploading to cloud…");

  try {
    const { doc, setDoc } = window._fsModules;
    const payload = {
      ...dataObj,
      _meta: {
        uploadedAt: new Date().toISOString(),
        deviceId: getDeviceId(),
        appVersion: "2.0",
        uid: activeUid,
        email: _currentUser.email,
        displayName: _currentUser.displayName,
      },
    };

    await setDoc(doc(_db, "spendwise_backups", activeUid), payload);

    // RE-VERIFY SESSION BEFORE CONFIRMING
    if (
      _currentSessionId !== activeSessionId ||
      !_currentUser ||
      _currentUser.uid !== activeUid
    ) {
      console.warn("[SpendWise Cloud] Session changed after cloud push completion.");
      return false;
    }

    saveMeta({
      lastBackup: new Date().toISOString(),
      email: _currentUser.email,
    });
    if (!silent) {
      updateCloudStatus(
        "synced",
        `Backed up ${new Date().toLocaleTimeString()}`,
      );
      showToast("☁️ Data backed up to cloud!", "success");
    }
    return true;
  } catch (err) {
    console.error("[SpendWise Cloud] Push error:", err);
    if (!silent) {
      updateCloudStatus("error", "Upload failed: " + err.message);
      showToast("Cloud backup failed: " + err.message, "error");
    }
    return false;
  } finally {
    _syncInProgress = false;
    if (_syncQueued) {
      _syncQueued = false;
      setTimeout(() => {
        if (_currentUser) {
          const latestLocal = getLocalState(_currentUser.uid);
          pushToCloud(latestLocal, true);
        }
      }, 500);
    }
  }
}

async function fetchCloudData(targetUid = null) {
  const activeUid = targetUid || (_currentUser ? _currentUser.uid : null);
  if (!activeUid || !_db) return null;
  try {
    const { doc, getDoc } = window._fsModules;
    const snap = await getDoc(doc(_db, "spendwise_backups", activeUid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("[SpendWise Cloud] Fetch error:", err);
    return null;
  }
}

async function restoreFromCloud(silent = false, requestSessionId = null, targetUid = null) {
  if (!_currentUser || !_db) {
    if (!silent) showToast("Please sign in first.", "error");
    return;
  }
  const activeUid = targetUid || _currentUser.uid;
  const activeSessionId = requestSessionId !== null ? requestSessionId : _currentSessionId;

  if (!silent) updateCloudStatus("syncing", "Downloading from cloud…");

  try {
    const cloudData = await fetchCloudData(activeUid);

    // RACE CONDITION GUARD BEFORE APPLYING
    if (
      _currentSessionId !== activeSessionId ||
      !_currentUser ||
      _currentUser.uid !== activeUid
    ) {
      console.warn("[SpendWise Cloud] Late cloud restore response discarded.");
      return;
    }

    if (!cloudData) {
      if (!silent) {
        updateCloudStatus("idle", "No cloud backup found.");
        showToast("No cloud backup found for this account.", "info");
      }
      return;
    }

    // Strip meta before storing
    const { _meta, ...cleanData } = cloudData;
    const restoredState = {
      expenses: Array.isArray(cleanData.expenses) ? cleanData.expenses : [],
      categories: Array.isArray(cleanData.categories)
        ? cleanData.categories
        : [],
      balanceRecords: Array.isArray(cleanData.balanceRecords)
        ? cleanData.balanceRecords
        : [],
      currency: cleanData.currency || "taka",
      savingsVaults: cleanData.savingsVaults || [],
      accounts: cleanData.accounts || null,
      activeAccountId: cleanData.activeAccountId || null,
    };

    const localState = getLocalState(activeUid);
    const merged = mergeStates(localState, restoredState);

    // FINAL RACE CONDITION GUARD BEFORE PERSISTING
    if (
      _currentSessionId !== activeSessionId ||
      !_currentUser ||
      _currentUser.uid !== activeUid
    ) {
      console.warn("[SpendWise Cloud] Discarding state merge due to session change.");
      return;
    }

    const userStorageKey = getUserStorageKey(activeUid);
    localStorage.setItem(userStorageKey, JSON.stringify(merged));

    if (typeof setStorageUserUid === "function") {
      setStorageUserUid(activeUid);
    }

    if (typeof loadState === "function") {
      const curScrollY = window.scrollY;
      const prevJson = typeof state !== "undefined" ? JSON.stringify(state) : null;
      loadState();
      const nextJson = typeof state !== "undefined" ? JSON.stringify(state) : null;
      if (prevJson !== nextJson && typeof renderAll === "function") {
        renderAll();
      }
      if (window.scrollY !== curScrollY) {
        window.scrollTo(0, curScrollY);
      }
    }

    const total =
      (merged.expenses?.length || 0) + (merged.balanceRecords?.length || 0);
    if (!silent) {
      updateCloudStatus("synced", `Restored ${total} records.`);
      showToast(`☁️ Restored ${total} records from cloud!`, "success");
    }
  } catch (err) {
    console.error("[SpendWise Cloud] Restore error:", err);
    if (!silent) {
      updateCloudStatus("error", "Restore failed: " + err.message);
      showToast("Cloud restore failed: " + err.message, "error");
    }
  }
}

// Smart merge: union of expenses + balance records by ID, prefer newer updatedAt
function mergeStates(local, cloud) {
  const mergeArray = (localArr, cloudArr) => {
    const map = {};
    [...(localArr || []), ...(cloudArr || [])].forEach((item) => {
      const existing = map[item.id];
      if (!existing) {
        map[item.id] = item;
        return;
      }
      // Prefer the one with a later createdAt/updatedAt if both exist
      const existTs = existing.updatedAt || existing.createdAt || "";
      const newTs = item.updatedAt || item.createdAt || "";
      if (newTs > existTs) map[item.id] = item;
    });
    return Object.values(map);
  };

  // For categories, prefer cloud (master) but keep any local-only ones
  const catMap = {};
  [...(cloud.categories || [])].forEach((c) => (catMap[c.id] = c));
  [...(local.categories || [])].forEach((c) => {
    if (!catMap[c.id]) catMap[c.id] = c;
  });

  return {
    expenses: mergeArray(local.expenses, cloud.expenses),
    categories: Object.values(catMap),
    balanceRecords: mergeArray(local.balanceRecords, cloud.balanceRecords),
    currency: cloud.currency || local.currency || "taka",
    savingsVaults: cloud.savingsVaults || local.savingsVaults || [],
    accounts: cloud.accounts || local.accounts || null,
    activeAccountId: cloud.activeAccountId || local.activeAccountId || null,
  };
}

// ─────────────────────────────────────────────────────
// REAL-TIME CROSS-DEVICE SYNC LISTENER
// ─────────────────────────────────────────────────────
function stopRealtimeSync() {
  if (typeof _realtimeUnsubscribe === "function") {
    try {
      _realtimeUnsubscribe();
    } catch (e) {}
    _realtimeUnsubscribe = null;
  }
}

function setupRealtimeSync(uid) {
  stopRealtimeSync();
  if (!uid || !_db) return;

  try {
    const { doc, onSnapshot } = window._fsModules;
    if (!onSnapshot) return;

    const docRef = doc(_db, "spendwise_backups", uid);
    _realtimeUnsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) return;
        const cloudPayload = docSnap.data();
        if (!cloudPayload) return;

        // Check if update originated from this exact client session to avoid echo
        const incomingDeviceId = cloudPayload._meta?.deviceId;
        const myDeviceId = getDeviceId();
        if (incomingDeviceId === myDeviceId && _syncInProgress) {
          return;
        }

        const { _meta, ...cleanData } = cloudPayload;
        const incomingState = {
          expenses: Array.isArray(cleanData.expenses) ? cleanData.expenses : [],
          categories: Array.isArray(cleanData.categories) ? cleanData.categories : [],
          balanceRecords: Array.isArray(cleanData.balanceRecords) ? cleanData.balanceRecords : [],
          currency: cleanData.currency || "taka",
          savingsVaults: cleanData.savingsVaults || [],
          accounts: cleanData.accounts || null,
          activeAccountId: cleanData.activeAccountId || null,
        };

        const activeUid = _currentUser ? _currentUser.uid : null;
        if (!activeUid || activeUid !== uid) return;

        const currentLocal = getLocalState(activeUid);

        // Check if incoming state is different from local state
        const localJson = JSON.stringify(currentLocal);
        const incomingJson = JSON.stringify(incomingState);
        if (localJson === incomingJson) return;

        console.log("[SpendWise Cloud] Real-time sync update received from device:", incomingDeviceId);
        _isApplyingCloudChange = true;

        const merged = mergeStates(currentLocal, incomingState);
        const userStorageKey = getUserStorageKey(activeUid);
        localStorage.setItem(userStorageKey, JSON.stringify(merged));

        if (typeof setStorageUserUid === "function") {
          setStorageUserUid(activeUid);
        }

        if (typeof loadState === "function") {
          const curScrollY = window.scrollY;
          const prevJson = typeof state !== "undefined" ? JSON.stringify(state) : null;
          loadState();
          const nextJson = typeof state !== "undefined" ? JSON.stringify(state) : null;
          if (prevJson !== nextJson && typeof renderAll === "function") {
            renderAll();
          }
          if (window.scrollY !== curScrollY) {
            window.scrollTo(0, curScrollY);
          }
        }

        updateCloudStatus(
          "synced",
          `Auto-synced with cloud (${new Date().toLocaleTimeString()})`
        );
        showToast("☁️ Auto-synced with cloud update!", "info");

        setTimeout(() => {
          _isApplyingCloudChange = false;
        }, 300);
      },
      (error) => {
        console.warn("[SpendWise Cloud] Real-time sync listener error:", error);
      }
    );
  } catch (err) {
    console.warn("[SpendWise Cloud] Could not initialize real-time listener:", err);
  }
}

// ─────────────────────────────────────────────────────
// BACKUP BUTTONS (called from UI)
// ─────────────────────────────────────────────────────
async function backupToCloud() {
  if (!_currentUser) {
    showToast("Please sign in to Google first.", "error");
    return;
  }
  const localState = getLocalState();
  await pushToCloud(localState, false);
}

async function restoreCloudBackup() {
  if (!_currentUser) {
    showToast("Please sign in to Google first.", "error");
    return;
  }
  const confirmed = await confirmAction(
    "⚠️ Restore from Cloud",
    "This will merge your cloud backup with current local data. Any conflicting records will use the most recent version. Continue?",
  );
  if (!confirmed) return;
  await restoreFromCloud(false);
}

// ─────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────
function updateCloudUI() {
  const signedIn = !!_currentUser;
  const signInBtn = document.getElementById("cloudSignInBtn");
  const signOutBtn = document.getElementById("cloudSignOutBtn");
  const backupBtn = document.getElementById("cloudBackupBtn");
  const restoreBtn = document.getElementById("cloudRestoreBtn");
  const userInfo = document.getElementById("cloudUserInfo");
  const cloudSection = document.getElementById("cloudSyncSection");

  if (!cloudSection) return;

  if (signedIn) {
    if (signInBtn) signInBtn.style.display = "none";
    if (signOutBtn) signOutBtn.style.display = "inline-flex";
    if (backupBtn) backupBtn.disabled = false;
    if (restoreBtn) restoreBtn.disabled = false;
    if (userInfo) {
      userInfo.textContent = `Signed in as ${_currentUser.email}`;
      userInfo.style.display = "block";
    }
    const meta = getMeta();
    if (meta && meta.lastBackup) {
      updateCloudStatus(
        "synced",
        `Last backup: ${new Date(meta.lastBackup).toLocaleString()}`,
      );
    } else {
      updateCloudStatus("idle", "Ready to backup.");
    }
  } else {
    if (signInBtn) signInBtn.style.display = "inline-flex";
    if (signOutBtn) signOutBtn.style.display = "none";
    if (backupBtn) backupBtn.disabled = true;
    if (restoreBtn) restoreBtn.disabled = true;
    if (userInfo) userInfo.style.display = "none";
    updateCloudStatus("idle", "Sign in to enable cloud backup.");
  }
}

function updateCloudStatus(type, message) {
  const el = document.getElementById("cloudStatusMsg");
  if (!el) return;
  const icons = {
    idle: "☁️",
    syncing: "🔄",
    "signing-in": "🔐",
    synced: "✅",
    error: "❌",
  };
  const colors = {
    idle: "var(--text-muted)",
    syncing: "var(--primary)",
    "signing-in": "var(--primary)",
    synced: "var(--green)",
    error: "var(--red)",
  };
  el.innerHTML = `<span class="cloud-status-icon">${
    icons[type] || "☁️"
  }</span> ${message}`;
  el.style.color = colors[type] || "var(--text-muted)";
  if (type === "syncing" || type === "signing-in") {
    el.classList.add("pulsing");
  } else {
    el.classList.remove("pulsing");
  }
}

// Simple confirm dialog using the existing confirm modal
function confirmAction(title, message) {
  return new Promise((resolve) => {
    const msgEl = document.getElementById("confirmMessage");
    const titleEl = document.querySelector("#confirmModal .modal-title");
    const confirmBtn = document.getElementById("confirmDeleteBtn");
    const cancelBtn = document.querySelector("#confirmModal .btn-secondary");
    if (!msgEl || !confirmBtn) {
      resolve(true);
      return;
    }
    if (titleEl) titleEl.textContent = title;
    msgEl.textContent = message;
    confirmBtn.textContent = "Yes, Continue";
    document.getElementById("confirmModal").classList.add("open");
    const yes = () => {
      cleanup();
      confirmBtn.textContent = "Delete";
      if (titleEl) titleEl.textContent = "Confirm Delete";
      document.getElementById("confirmModal").classList.remove("open");
      resolve(true);
    };
    const no = () => {
      cleanup();
      confirmBtn.textContent = "Delete";
      if (titleEl) titleEl.textContent = "Confirm Delete";
      document.getElementById("confirmModal").classList.remove("open");
      resolve(false);
    };
    const cleanup = () => {
      confirmBtn.removeEventListener("click", yes);
      cancelBtn.removeEventListener("click", no);
    };
    confirmBtn.addEventListener("click", yes);
    cancelBtn.addEventListener("click", no);
  });
}

// ─────────────────────────────────────────────────────
// METADATA HELPERS
// ─────────────────────────────────────────────────────
function saveMeta(data) {
  const activeUid = _currentUser ? _currentUser.uid : null;
  const metaKey = getUserMetaKey(activeUid);
  const existing = getMeta(activeUid) || {};
  localStorage.setItem(
    metaKey,
    JSON.stringify({ ...existing, ...data }),
  );
}
function getMeta(targetUid = null) {
  try {
    const activeUid = targetUid || (_currentUser ? _currentUser.uid : null);
    const metaKey = getUserMetaKey(activeUid);
    return JSON.parse(localStorage.getItem(metaKey) || "null");
  } catch {
    return null;
  }
}
function getDeviceId() {
  let id = localStorage.getItem("spendwise_device_id");
  if (!id) {
    id = "dev_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem("spendwise_device_id", id);
  }
  return id;
}

// ─────────────────────────────────────────────────────
// INIT on page load — attempt to silently restore session
// ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Only init Firebase if configured
  if (FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_WEB_API_KEY") {
    initFirebase().then(() => updateCloudUI());
  } else {
    updateCloudStatus(
      "idle",
      "⚙️ Configure Firebase in cloud-sync.js to enable cloud backup.",
    );
  }
});


// ─────────────────────────────────────────────────────
// GLOBAL EXPORTS FOR REAL-TIME AUTO BACKUP
// ─────────────────────────────────────────────────────
window.pushToCloud = pushToCloud;
window.isCloudUserSignedIn = function() { return !!_currentUser; };
window.isCloudSyncActive = function() { return _syncInProgress || _isApplyingCloudChange; };

let _cloudDebounceTimer = null;
window.triggerAutoCloudBackup = function(stateObj) {
  if (!_currentUser || !_db || _isApplyingCloudChange) return;
  clearTimeout(_cloudDebounceTimer);
  _cloudDebounceTimer = setTimeout(async () => {
    try {
      const activeUid = _currentUser ? _currentUser.uid : null;
      if (!activeUid) return;
      console.log('[Spendio Cloud] Triggering automatic cloud sync...');
      await pushToCloud(stateObj || getLocalState(activeUid), true);
    } catch (e) {
      console.warn('[Spendio Cloud] Auto cloud backup failed:', e);
    }
  }, 1000);
};
