import { useState } from "react";
import { api, type User } from "../api";
import { Modal } from "./Modal";
export function Account({
  user,
  onUser,
  onClose,
}: {
  user: User | null;
  onUser: (user: User | null) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      username = String(form.get("username") ?? ""),
      password = String(form.get("password") ?? ""),
      recoveryCode = String(form.get("recoveryCode") ?? "");
    try {
      const result = await api<{ user: User; recoveryCode?: string }>(
        `/auth/${mode}`,
        { username, password, ...(mode === "recover" ? { recoveryCode } : {}) },
      );
      onUser(result.user);
      if (result.recoveryCode) setCode(result.recoveryCode);
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await api("/auth/logout", {});
      onUser(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (code)
    return (
      <Modal title="SAVE YOUR RECOVERY CODE" onClose={onClose}>
        <p>
          Keep this code somewhere private. Use it to recover your account if
          you forget your password. Recovery rotates the code and signs out
          existing sessions.
        </p>
        <code className="recovery-code">{code}</code>
        <button className="primary-button" onClick={onClose}>
          I’ve saved my code
        </button>
      </Modal>
    );
  if (user)
    return (
      <Modal
        title={`HELLO, ${user.username.toUpperCase()}`}
        onClose={onClose}
        closeDisabled={busy}
      >
        <p>
          Your account is connected. Finished races can be submitted to shared
          standings after server replay verification.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy} onClick={logout}>
          Sign out
        </button>
      </Modal>
    );
  return (
    <Modal
      title={
        mode === "register"
          ? "JOIN THE WORKSHOP"
          : mode === "recover"
            ? "RECOVER YOUR ACCOUNT"
            : "WELCOME BACK"
      }
      onClose={onClose}
      closeDisabled={busy}
    >
      <div className="mode-tabs">
        {(
          [
            ["login", "Sign in"],
            ["register", "Create account"],
            ["recover", "Recovery"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={mode === id ? "active" : ""}
            disabled={busy}
            onClick={() => {
              setMode(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p>
        Race locally anytime. Sign in to compete on verified shared standings.
      </p>
      <form onSubmit={submit} className="account-form">
        <label>
          Driver name
          <input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_-]+"
            placeholder="Your racing name"
          />
        </label>
        {mode === "recover" && (
          <label>
            Recovery code
            <input
              name="recoveryCode"
              autoComplete="off"
              required
              placeholder="Your saved recovery code"
            />
          </label>
        )}
        <label>
          {mode === "recover" ? "New password" : "Password"}
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            placeholder="At least 12 characters"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy
            ? "Connecting…"
            : mode === "login"
              ? "Sign in"
              : mode === "recover"
                ? "Recover account"
                : "Create account"}
        </button>
      </form>
    </Modal>
  );
}
