/* =====================================================
   Spendio – cloud-sync.js
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
      "[Spendio Cloud] Could not load native Firebase Authentication plugin:",
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
      "[Spendio Cloud] Firebase Web App config is incomplete. Add the config from Firebase Console.",
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
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      sendPasswordResetEmail,
      updateProfile,
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
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      sendPasswordResetEmail,
      updateProfile,
    };

    _cloudInitialized = true;

    try {
      updateCloudStatus("syncing", "Finalizing Google Sign-in...");
      const result = await getRedirectResult(_auth);
      if (result && result.user) {
        // Success
      }
    } catch (err) {
      console.error("[Spendio Cloud] Redirect sign-in error:", err);
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
          console.error("[Spendio Cloud] Post-login migration error:", err);
        }
        // Start real-time cross-device sync listener
        setupRealtimeSync(activeUid);
      } else {
        stopRealtimeSync();
      }
    });

    return true;
  } catch (err) {
    console.error("[Spendio Cloud] Firebase init error:", err);
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

      console.log("[Spendio Cloud] Native Google sign-in result:", result);

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
    console.error("[Spendio Cloud] Google sign-in error:", err);

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
    throw err;
  }
}

async function cloudSignInWithEmail(email, password) {
  updateCloudStatus("signing-in", "Signing in with email…");
  const ok = await initFirebase();
  if (!ok) {
    updateCloudStatus("error", "Firebase initialization failed.");
    showToast("Firebase initialization failed.", "error");
    throw new Error("Firebase initialization failed");
  }

  try {
    const { signInWithEmailAndPassword } = window._fsModules;
    const userCredential = await signInWithEmailAndPassword(_auth, email.trim(), password);
    showToast("Signed in successfully!", "success");
    return userCredential.user;
  } catch (err) {
    console.error("[Spendio Cloud] Email sign-in error:", err);
    let msg = err.message || "Failed to sign in";
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
      msg = "Invalid email or password.";
    } else if (err.code === "auth/too-many-requests") {
      msg = "Too many attempts. Please try again later.";
    }
    updateCloudStatus("error", "Sign-in error: " + msg);
    showToast(msg, "error");
    throw new Error(msg);
  }
}

async function cloudSignUpWithEmail(name, email, password) {
  updateCloudStatus("signing-in", "Creating account…");
  const ok = await initFirebase();
  if (!ok) {
    updateCloudStatus("error", "Firebase initialization failed.");
    showToast("Firebase initialization failed.", "error");
    throw new Error("Firebase initialization failed");
  }

  try {
    const { createUserWithEmailAndPassword, updateProfile } = window._fsModules;
    const userCredential = await createUserWithEmailAndPassword(_auth, email.trim(), password);
    if (name && name.trim()) {
      try {
        await updateProfile(userCredential.user, { displayName: name.trim() });
      } catch (profileErr) {
        console.warn("[Spendio Cloud] Update profile error:", profileErr);
      }
    }
    showToast("Account created successfully!", "success");
    return userCredential.user;
  } catch (err) {
    console.error("[Spendio Cloud] Sign-up error:", err);
    let msg = err.message || "Failed to sign up";
    if (err.code === "auth/email-already-in-use") {
      msg = "This email is already registered. Please sign in.";
    } else if (err.code === "auth/weak-password") {
      msg = "Password should be at least 6 characters.";
    } else if (err.code === "auth/invalid-email") {
      msg = "Please enter a valid email address.";
    }
    updateCloudStatus("error", "Sign-up error: " + msg);
    showToast(msg, "error");
    throw new Error(msg);
  }
}

async function cloudResetPassword(email) {
  const ok = await initFirebase();
  if (!ok) {
    showToast("Firebase initialization failed.", "error");
    throw new Error("Firebase initialization failed");
  }

  try {
    const { sendPasswordResetEmail } = window._fsModules;
    await sendPasswordResetEmail(_auth, email.trim());
    showToast("Password reset email sent! Check your inbox.", "success");
    return true;
  } catch (err) {
    console.error("[Spendio Cloud] Password reset error:", err);
    let msg = err.message || "Failed to send reset email";
    if (err.code === "auth/user-not-found") {
      msg = "No account found with this email.";
    }
    showToast(msg, "error");
    throw new Error(msg);
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
            console.warn("[Spendio Cloud] Native sign-out warning:", nativeErr);
          }
        }
      }

      await signOut(_auth);
    } catch (err) {
      console.error("[Spendio Cloud] Sign-out error:", err);
    }
  }

  _currentUser = null;

  // Sign out cleanly without destroying guest local storage data!
  if (typeof setStorageUserUid === "function") {
    setStorageUserUid(null);
  }

  // Reload guest app state and re-render UI
  if (typeof loadState === "function") {
    loadState();
    if (typeof renderAll === "function") {
      renderAll();
    }
  }

  updateCloudUI();
  showToast("Signed out. Switched to offline guest mode.", "info");
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
    console.warn("[Spendio Cloud] Stale migration fetch discarded for UID:", activeUid);
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
    requestSessionId !== null &&
    (_currentSessionId !== activeSessionId ||
      !_currentUser ||
      _currentUser.uid !== activeUid)
  ) {
    console.warn("[Spendio Cloud] Push discarded due to session/UID mismatch.");
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
      requestSessionId !== null &&
      (_currentSessionId !== activeSessionId ||
        !_currentUser ||
        _currentUser.uid !== activeUid)
    ) {
      console.warn("[Spendio Cloud] Session changed after cloud push completion.");
      return false;
    }

    saveMeta({
      lastBackup: new Date().toISOString(),
      email: _currentUser.email,
    });
    updateCloudStatus(
      "synced",
      `Auto-synced with cloud (${new Date().toLocaleTimeString()})`
    );
    if (!silent) {
      showToast("☁️ Data backed up to cloud!", "success");
    }
    return true;
  } catch (err) {
    console.error("[Spendio Cloud] Push error:", err);
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
    console.error("[Spendio Cloud] Fetch error:", err);
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
      console.warn("[Spendio Cloud] Late cloud restore response discarded.");
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
      console.warn("[Spendio Cloud] Discarding state merge due to session change.");
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
    console.error("[Spendio Cloud] Restore error:", err);
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
        if (incomingDeviceId === myDeviceId) {
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

        console.log("[Spendio Cloud] Real-time sync update received from device:", incomingDeviceId);
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
        console.warn("[Spendio Cloud] Real-time sync listener error:", error);
      }
    );
  } catch (err) {
    console.warn("[Spendio Cloud] Could not initialize real-time listener:", err);
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
// AVATAR & USER PROFILE HELPERS
// ─────────────────────────────────────────────────────
const DEFAULT_AVATAR_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%236366f1'/%3E%3Cstop offset='100%25' stop-color='%234f46e5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' rx='50' fill='url(%23g)'/%3E%3Ccircle cx='50' cy='38' r='16' fill='%23ffffff' opacity='0.95'/%3E%3Cpath d='M22 84 C22 68 34 58 50 58 C66 58 78 68 78 84 Z' fill='%23ffffff' opacity='0.95'/%3E%3C/svg%3E";

function getEffectiveUserPhoto(user) {
  if (!user) return "";
  if (user.photoURL && typeof user.photoURL === "string" && user.photoURL.trim()) {
    return user.photoURL.trim();
  }
  if (Array.isArray(user.providerData)) {
    for (const p of user.providerData) {
      if (p && p.photoURL && typeof p.photoURL === "string" && p.photoURL.trim()) {
        return p.photoURL.trim();
      }
    }
  }
  return "";
}

function renderUserAvatar(user, sizeClass = "user-avatar-img") {
  const photo = getEffectiveUserPhoto(user);
  const name = (user && (user.displayName || (user.email ? user.email.split("@")[0] : ""))) || "User";
  if (photo) {
    return `<img src="${photo}" alt="${name}" class="${sizeClass}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_DATA_URI}';" />`;
  }
  return `<img src="${DEFAULT_AVATAR_DATA_URI}" alt="${name}" class="${sizeClass}" />`;
}

// ─────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────
function updateCloudUI() {
  const signedIn = !!_currentUser;
  const signInBtn = document.getElementById("cloudSignInBtn");
  const backupBtn = document.getElementById("cloudBackupBtn");
  const restoreBtn = document.getElementById("cloudRestoreBtn");
  const cloudSection = document.getElementById("cloudSyncSection");

  // Update Topbar and Sidebar Profile Elements
  const topbarAvatar = document.getElementById("topbarAvatar");
  const topbarSyncIcon = document.getElementById("topbarSyncIcon");
  const sidebarProfileCard = document.getElementById("sidebarProfileCard");
  const accountHeader = document.getElementById("accountProfileHeader");

  const displayName = (_currentUser && (_currentUser.displayName || _currentUser.email.split("@")[0])) || "User";
  const email = (_currentUser && _currentUser.email) || "";

  // 1. Topbar Update
  if (topbarAvatar) {
    if (signedIn) {
      topbarAvatar.innerHTML = renderUserAvatar(_currentUser, "user-avatar-img");
      topbarAvatar.title = `${displayName} (${email})`;
    } else {
      topbarAvatar.innerHTML = `<div class="user-avatar-guest" title="Guest Mode - Click to Sign In"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span class="guest-dot"></span></div>`;
    }
  }

  // 2. Sidebar Profile Card Update
  if (sidebarProfileCard) {
    if (signedIn) {
      const avatarHtml = renderUserAvatar(_currentUser, "sidebar-avatar-img");
      sidebarProfileCard.innerHTML = `
        <div class="sidebar-user-info" onclick="navigateTo('cloud')">
          ${avatarHtml}
          <div class="sidebar-user-text">
            <span class="sidebar-user-name">${displayName}</span>
            <span class="sidebar-user-status" id="sidebarSyncStatus"><span class="sync-dot synced"></span> Synced</span>
          </div>
        </div>
      `;
    } else {
      sidebarProfileCard.innerHTML = `
        <div class="sidebar-guest-card" onclick="openAuthModal()">
          <div class="sidebar-guest-badge">Guest</div>
          <span class="sidebar-guest-msg">Sign in to back up</span>
          <button class="sidebar-guest-btn" type="button">Sign In</button>
        </div>
      `;
    }
  }

  // 3. Account Header in Cloud/Account Page
  if (accountHeader) {
    if (signedIn) {
      const avatarHtml = renderUserAvatar(_currentUser, "acc-hero-avatar-img");
      accountHeader.innerHTML = `
        <div class="acc-hero-wrapper">
          <div class="acc-hero-left">
            <div class="acc-avatar-box">
              ${avatarHtml}
            </div>
            <div class="acc-hero-info">
              <h2 class="acc-hero-name">${displayName}</h2>
              <p class="acc-hero-email">${email}</p>
              <div class="acc-hero-meta">
                <span class="acc-badge-cloud"><span class="pulse-dot"></span> Cloud Sync Active</span>
              </div>
            </div>
          </div>
          <button class="btn btn-danger-soft btn-acc-signout" onclick="cloudSignOut()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Sign Out
          </button>
        </div>
      `;
    } else {
      accountHeader.innerHTML = `
        <div class="acc-guest-hero">
          <div class="acc-guest-hero-info">
            <div class="acc-guest-pill">Guest Mode</div>
            <h2 class="acc-guest-title">Back up and sync your expenses</h2>
            <p class="acc-guest-subtitle">Sign in free to sync across mobile, tablet, and desktop without losing offline freedom.</p>
          </div>
          <button class="btn btn-primary btn-hero-signin" onclick="openAuthModal()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
            Sign In / Register
          </button>
        </div>
      `;
    }
  }

  if (!cloudSection) return;

  const authWrap = document.getElementById("cloudAuthSectionWrap");

  if (signedIn) {
    if (authWrap) authWrap.style.display = "none";
    if (signInBtn) signInBtn.style.display = "none";
    if (backupBtn) backupBtn.disabled = false;
    if (restoreBtn) restoreBtn.disabled = false;
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
    if (authWrap) authWrap.style.display = "block";
    if (signInBtn) signInBtn.style.display = "inline-flex";
    if (backupBtn) backupBtn.disabled = true;
    if (restoreBtn) restoreBtn.disabled = true;
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
// Defers initialization until browser is idle or after first paint
// ─────────────────────────────────────────────────────
function scheduleFirebaseInit() {
  if (FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_WEB_API_KEY") {
    initFirebase().then(() => updateCloudUI());
  } else {
    updateCloudStatus(
      "idle",
      "⚙️ Configure Firebase in cloud-sync.js to enable cloud backup.",
    );
  }
}

if ("requestIdleCallback" in window) {
  window.requestIdleCallback(scheduleFirebaseInit, { timeout: 1500 });
} else {
  window.addEventListener("load", () => {
    setTimeout(scheduleFirebaseInit, 100);
  });
}


// ─────────────────────────────────────────────────────
// GLOBAL EXPORTS FOR REAL-TIME AUTO BACKUP
// ─────────────────────────────────────────────────────
window.pushToCloud = pushToCloud;
window.isCloudUserSignedIn = function() { return !!_currentUser; };
window.isCloudSyncActive = function() { return _syncInProgress || _isApplyingCloudChange; };

let _cloudDebounceTimer = null;
window.triggerAutoCloudBackup = function(stateObj) {
  if (!_currentUser || !_db) return;
  clearTimeout(_cloudDebounceTimer);
  _cloudDebounceTimer = setTimeout(async () => {
    try {
      const activeUid = _currentUser ? _currentUser.uid : null;
      if (!activeUid) return;
      console.log('[Spendio Cloud] Triggering automatic cloud sync...');
      const data = stateObj || getLocalState(activeUid);
      await pushToCloud(data, true, null, activeUid);
    } catch (e) {
      console.warn('[Spendio Cloud] Auto cloud backup failed:', e);
    }
  }, 400);
};
