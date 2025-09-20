"use client";
import React from 'react';

export default function ConfirmDialog({
  open,
  title = "Confirmation",
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10">
          <div className="px-6 pt-5 pb-3 border-b border-white/10">
            <h3 className="text-white text-lg font-bold">{title}</h3>
          </div>
          <div className="px-6 py-4">
            <p className="text-white/80 text-sm leading-relaxed">{message}</p>
          </div>
          <div className="px-6 pb-5 pt-2 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-white text-sm font-semibold transition"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-semibold shadow"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
