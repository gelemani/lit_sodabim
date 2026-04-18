"use client";
import React from "react";

interface Props {
  commentText: string;
  onCommentTextChange: (v: string) => void;
  sketchSvg: string | null;
  onDrawRequest: () => void;
  onDeleteSketch: () => void;
  onSave: () => void;
  disabled?: boolean;
}

export default function CommentWithSketch({
  commentText, onCommentTextChange,
  sketchSvg, onDrawRequest, onDeleteSketch,
  onSave, disabled
}: Props) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Комментарий
      </label>
      <textarea
        style={{
          marginTop: 4, width: "100%", minHeight: 60,
          background: "#252a33", border: "1px solid #374151",
          borderRadius: 6, color: "#f1f5f9", padding: 8, resize: "vertical",
          fontSize: 13, boxSizing: "border-box"
        }}
        placeholder="Добавьте комментарий к элементу..."
        value={commentText}
        onChange={e => onCommentTextChange(e.target.value)}
      />

      {/* Sketch preview */}
      {sketchSvg && (
        <div style={{ position: "relative", marginTop: 6, marginBottom: 4 }}>
          <div
            dangerouslySetInnerHTML={{ __html: sketchSvg }}
            style={{
              background: "#0f1117", borderRadius: 6, border: "1px solid #374151",
              maxHeight: 120, overflow: "hidden", lineHeight: 0
            }}
          />
          <button
            onClick={onDeleteSketch}
            title="Удалить эскиз"
            style={{
              position: "absolute", top: 4, right: 4,
              background: "#ef4444", color: "#fff", border: "none",
              borderRadius: "50%", width: 20, height: 20,
              cursor: "pointer", fontSize: 12, lineHeight: "20px", padding: 0
            }}
          >×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          onClick={onDrawRequest}
          title="Нарисовать эскиз поверх модели"
          style={{
            background: "#374151", color: "#e2e8f0", border: "1px solid #4b5563",
            borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12,
            display: "flex", alignItems: "center", gap: 4
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
          {sketchSvg ? "Перерисовать" : "Нарисовать"}
        </button>
        <button
          onClick={onSave}
          disabled={disabled || !commentText.trim()}
          style={{
            flex: 1, background: commentText.trim() ? "#3b82f6" : "#374151",
            color: "#fff", border: "none", borderRadius: 6,
            padding: "5px 12px", cursor: commentText.trim() ? "pointer" : "default",
            fontSize: 13, fontWeight: 600, opacity: disabled ? 0.6 : 1
          }}
        >
          Добавить
        </button>
      </div>
    </div>
  );
}
