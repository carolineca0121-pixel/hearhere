"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";
import type { ScheduleConflict } from "@/lib/types";

interface ConflictAlertProps {
  conflicts: ScheduleConflict[];
}

export function ConflictAlert({ conflicts }: ConflictAlertProps) {
  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
        <CheckCircle className="w-5 h-5 text-green-600" />
        <span className="text-sm text-green-700">行程安排很合理！</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conflicts.map((conflict, index) => (
        <div
          key={index}
          className={`flex items-start gap-3 p-3 rounded-xl ${
            conflict.severity === "error"
              ? "bg-red-50"
              : "bg-amber-50"
          }`}
        >
          <AlertTriangle
            className={`w-5 h-5 mt-0.5 ${
              conflict.severity === "error"
                ? "text-red-600"
                : "text-amber-600"
            }`}
          />
          <div className="flex-1">
            <p className={`text-sm font-medium ${
              conflict.severity === "error"
                ? "text-red-800"
                : "text-amber-800"
            }`}>
              {conflict.message}
            </p>
            {conflict.suggestion && (
              <p className={`text-xs mt-1 ${
                conflict.severity === "error"
                  ? "text-red-600"
                  : "text-amber-600"
              }`}>
                💡 {conflict.suggestion}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );}
