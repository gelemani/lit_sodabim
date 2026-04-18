"use client";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/header";
import { apiService } from "@/app/services/api.service";

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserData {
  id: number;
  login: string;
  userName: string;
  userSurname: string;
  email: string;
  companyName: string;
  companyPosition: string;
}

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string, surname: string): string {
  return [(name || "?")[0], (surname || "")[0]].filter(Boolean).join("").toUpperCase();
}

function avatarGradient(login: string): string {
  const gradients = [
    "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    "linear-gradient(135deg,#06b6d4,#3b82f6)",
    "linear-gradient(135deg,#8b5cf6,#ec4899)",
    "linear-gradient(135deg,#22c55e,#3b82f6)",
    "linear-gradient(135deg,#f97316,#ef4444)",
    "linear-gradient(135deg,#a855f7,#3b82f6)",
  ];
  const idx = login.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

function validate(fields: Partial<UserData>): string | null {
  if (!fields.userName?.trim()) return "Имя не может быть пустым.";
  if (!fields.userSurname?.trim()) return "Фамилия не может быть пустой.";
  if (!fields.email?.trim() || !fields.email.includes("@")) return "Введите корректный email.";
  if (!fields.companyName?.trim()) return "Название компании не может быть пустым.";
  return null;
}

// ── Toast component ───────────────────────────────────────────────────────────
function ToastList({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 70, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-fade-in"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: t.type === "success" ? "#14532d" : t.type === "error" ? "#450a0a" : "#1e3a5f",
            border: `1px solid ${t.type === "success" ? "#22c55e" : t.type === "error" ? "#ef4444" : "#3b82f6"}`,
            color: "#e2e8f0", padding: "10px 16px", borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)", minWidth: 280, maxWidth: 380, fontSize: 14,
          }}
        >
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => onRemove(t.id)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Input field ───────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, type = "text", disabled, placeholder, autoComplete,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; disabled?: boolean; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: "100%", padding: "10px 14px",
          background: disabled ? "#161920" : "#252a33",
          border: `1px solid ${disabled ? "#1e2530" : "#374151"}`,
          borderRadius: 8, color: disabled ? "#64748b" : "#f1f5f9",
          fontSize: 14, boxSizing: "border-box",
          transition: "border-color 0.15s, box-shadow 0.15s",
          cursor: disabled ? "not-allowed" : "text",
        }}
        onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = "#3b82f6"; }}
        onBlur={e => { e.currentTarget.style.borderColor = disabled ? "#1e2530" : "#374151"; }}
      />
    </div>
  );
}

// ── Password visibility toggle ────────────────────────────────────────────────
function PasswordField({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 18, position: "relative" }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          style={{
            width: "100%", padding: "10px 42px 10px 14px",
            background: "#252a33", border: "1px solid #374151",
            borderRadius: 8, color: "#f1f5f9",
            fontSize: 14, boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "#3b82f6"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#374151"; }}
        />
        <button
          type="button"
          onClick={() => setShow(p => !p)}
          style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: 0,
          }}
          title={show ? "Скрыть" : "Показать"}
        >
          {show
            ? <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            : <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          }
        </button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="animate-fade-in" style={{
      background: "#1a1d24", border: "1px solid #2d3748",
      borderRadius: 14, padding: 28,
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Edit form
  const [form, setForm] = useState({ userName: "", userSurname: "", email: "", companyName: "", companyPosition: "" });
  const [dirty, setDirty] = useState(false);

  // Password form
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwStrength, setPwStrength] = useState(0);

  const addToast = (message: string, type: ToastType = "info") => {
    const id = ++toastId.current;
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  };

  // ── Load user ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token") ?? localStorage.getItem("authToken");
    if (!token) { router.push("/"); return; }

    (async () => {
      const res = await apiService.getMe();
      if (!res.success || !res.data) {
        router.push("/");
        return;
      }
      const u = res.data as unknown as UserData;
      setUser(u);
      setForm({
        userName: u.userName ?? "",
        userSurname: u.userSurname ?? "",
        email: u.email ?? "",
        companyName: u.companyName ?? "",
        companyPosition: u.companyPosition ?? "",
      });
      setLoading(false);
    })();
  }, [router]);

  // ── Password strength ──────────────────────────────────────────────────────
  useEffect(() => {
    const pw = pwForm.newPassword;
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    setPwStrength(score);
  }, [pwForm.newPassword]);

  const pwStrengthLabel = ["", "Очень слабый", "Слабый", "Средний", "Хороший", "Надёжный"][pwStrength];
  const pwStrengthColor = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"][pwStrength];

  // ── Save profile ───────────────────────────────────────────────────────────
  const saveProfile = async () => {
    const err = validate(form);
    if (err) { addToast(err, "error"); return; }
    setSaving(true);
    const res = await apiService.updateProfile(form);
    setSaving(false);
    if (res.success) {
      setUser(prev => prev ? { ...prev, ...form } : prev);
      setDirty(false);
      addToast("Профиль успешно обновлён", "success");
    } else {
      addToast(res.error ?? "Ошибка сохранения", "error");
    }
  };

  const resetForm = () => {
    if (!user) return;
    setForm({ userName: user.userName, userSurname: user.userSurname, email: user.email, companyName: user.companyName, companyPosition: user.companyPosition });
    setDirty(false);
  };

  // ── Change password ────────────────────────────────────────────────────────
  const changePassword = async () => {
    if (!pwForm.currentPassword) { addToast("Введите текущий пароль", "error"); return; }
    if (pwForm.newPassword.length < 6) { addToast("Новый пароль — минимум 6 символов", "error"); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { addToast("Пароли не совпадают", "error"); return; }
    setChangingPw(true);
    const res = await apiService.changePassword(pwForm);
    setChangingPw(false);
    if (res.success) {
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      addToast("Пароль успешно изменён", "success");
    } else {
      addToast(res.error ?? "Ошибка смены пароля", "error");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Header centralString="Профиль" backHref="/projects" />
        <div style={{ paddingTop: 80, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 16 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        </div>
      </>
    );
  }

  if (!user) return null;

  const initials = getInitials(user.userName, user.userSurname);
  const gradient = avatarGradient(user.login);

  return (
    <>
      <Header centralString="Профиль" backHref="/projects" />
      <ToastList toasts={toasts} onRemove={id => setToasts(p => p.filter(t => t.id !== id))} />

      <div style={{
        paddingTop: 68, minHeight: "100vh",
        background: "linear-gradient(160deg, #0f1117 0%, #141820 100%)",
      }}>
        {/* Шапка с аватаром */}
        <div style={{
          background: "linear-gradient(135deg, #1a1d24 0%, #141820 100%)",
          borderBottom: "1px solid #2d3748",
          padding: "32px 0 0",
          marginBottom: 32,
        }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 24, paddingBottom: 28 }}>
              {/* Аватар */}
              <div style={{
                width: 88, height: 88, borderRadius: "50%",
                background: gradient,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, fontWeight: 700, color: "#fff",
                flexShrink: 0,
                boxShadow: "0 0 0 4px #1a1d24, 0 0 0 6px #374151",
                letterSpacing: -1,
              }}>
                {initials}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2 }}>
                  {user.userName} {user.userSurname}
                </h1>
                <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>@{user.login}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    background: "#1e2530", border: "1px solid #374151",
                    color: "#94a3b8", fontSize: 12, padding: "3px 10px", borderRadius: 20,
                  }}>
                    {user.companyPosition || "Должность не указана"}
                  </span>
                  <span style={{
                    background: "#1e2530", border: "1px solid #374151",
                    color: "#94a3b8", fontSize: 12, padding: "3px 10px", borderRadius: 20,
                  }}>
                    🏢 {user.companyName || "Компания не указана"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Контент */}
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Личные данные */}
          <Card>
            <h2 style={{ margin: "0 0 22px", fontSize: 16, fontWeight: 600, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" fill="none" stroke="#3b82f6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Личные данные
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Field label="Имя" value={form.userName}
                onChange={v => { setForm(p => ({ ...p, userName: v })); setDirty(true); }} />
              <Field label="Фамилия" value={form.userSurname}
                onChange={v => { setForm(p => ({ ...p, userSurname: v })); setDirty(true); }} />
            </div>

            <Field label="Email" value={form.email} type="email"
              onChange={v => { setForm(p => ({ ...p, email: v })); setDirty(true); }}
              autoComplete="email" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Field label="Компания" value={form.companyName}
                onChange={v => { setForm(p => ({ ...p, companyName: v })); setDirty(true); }} />
              <Field label="Должность" value={form.companyPosition}
                onChange={v => { setForm(p => ({ ...p, companyPosition: v })); setDirty(true); }} />
            </div>

            <Field label="Логин" value={user.login} disabled />

            {dirty && (
              <div className="animate-fade-in" style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  style={{
                    background: "#3b82f6", color: "#fff", border: "none",
                    padding: "10px 24px", borderRadius: 8, cursor: saving ? "wait" : "pointer",
                    fontWeight: 600, fontSize: 14, opacity: saving ? 0.7 : 1,
                    transition: "background 0.15s, opacity 0.15s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  {saving && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 0.8s linear infinite" }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  )}
                  {saving ? "Сохранение..." : "Сохранить изменения"}
                </button>
                <button
                  onClick={resetForm}
                  style={{
                    background: "transparent", color: "#94a3b8",
                    border: "1px solid #374151", padding: "10px 20px",
                    borderRadius: 8, cursor: "pointer", fontSize: 14,
                  }}
                >
                  Отменить
                </button>
              </div>
            )}
          </Card>

          {/* Безопасность */}
          <Card>
            <h2 style={{ margin: "0 0 22px", fontSize: 16, fontWeight: 600, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" fill="none" stroke="#8b5cf6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Безопасность
            </h2>

            <PasswordField label="Текущий пароль" value={pwForm.currentPassword}
              onChange={v => setPwForm(p => ({ ...p, currentPassword: v }))}
              autoComplete="current-password" />

            <PasswordField label="Новый пароль" value={pwForm.newPassword}
              onChange={v => setPwForm(p => ({ ...p, newPassword: v }))}
              autoComplete="new-password" />

            {pwForm.newPassword.length > 0 && (
              <div className="animate-fade-in" style={{ marginTop: -10, marginBottom: 18 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i <= pwStrength ? pwStrengthColor : "#374151",
                      transition: "background 0.2s",
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: pwStrengthColor }}>{pwStrengthLabel}</span>
              </div>
            )}

            <PasswordField label="Подтверждение пароля" value={pwForm.confirmPassword}
              onChange={v => setPwForm(p => ({ ...p, confirmPassword: v }))}
              autoComplete="new-password" />

            {pwForm.newPassword && pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
              <div className="animate-fade-in" style={{ marginTop: -10, marginBottom: 12, fontSize: 12, color: "#ef4444" }}>
                Пароли не совпадают
              </div>
            )}

            <button
              onClick={changePassword}
              disabled={changingPw || !pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword}
              style={{
                background: pwForm.currentPassword && pwForm.newPassword && pwForm.confirmPassword ? "#8b5cf6" : "#2d3748",
                color: "#fff", border: "none", padding: "10px 24px",
                borderRadius: 8, cursor: changingPw || !pwForm.currentPassword ? "not-allowed" : "pointer",
                fontWeight: 600, fontSize: 14, opacity: changingPw ? 0.7 : 1,
                transition: "background 0.2s, opacity 0.15s",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              {changingPw && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              )}
              {changingPw ? "Смена пароля..." : "Изменить пароль"}
            </button>
          </Card>

          {/* Данные аккаунта (read-only) */}
          <Card>
            <h2 style={{ margin: "0 0 22px", fontSize: 16, fontWeight: 600, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" fill="none" stroke="#22c55e" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Информация об аккаунте
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "ID аккаунта", value: `#${user.id}` },
                { label: "Логин", value: user.login },
                { label: "Email", value: user.email },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: "#161920", border: "1px solid #2d3748",
                  borderRadius: 8, padding: "12px 16px",
                }}>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14, color: "#94a3b8", wordBreak: "break-all" }}>{value}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Danger zone */}
          <Card>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#ef4444", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" fill="none" stroke="#ef4444" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Выход из аккаунта
            </h2>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
              После выхода вам потребуется снова войти.
            </p>
            <button
              onClick={() => { apiService.logout(); router.push("/"); }}
              style={{
                background: "transparent", color: "#ef4444",
                border: "1px solid #ef4444", padding: "9px 20px",
                borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14,
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#ef4444"; }}
            >
              Выйти из аккаунта
            </button>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
