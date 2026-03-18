"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";

interface EnvVarEntry {
  key: string;
  maskedValue: string;
  editing: boolean;
  newValue: string;
}

export function EnvVarsManager() {
  const [entries, setEntries] = useState<EnvVarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showNewValue, setShowNewValue] = useState(false);
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set());
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});

  const fetchVars = useCallback(async () => {
    try {
      const res = await fetch("/api/env-vars");
      const data = await res.json();
      if (data.success) {
        const vars = data.data.variables as Record<string, string>;
        setEntries(
          Object.entries(vars).map(([key, maskedValue]) => ({
            key,
            maskedValue,
            editing: false,
            newValue: "",
          }))
        );
        // Clear revealed values when refetching
        setRevealedValues({});
        setVisibleValues(new Set());
      }
    } catch (err) {
      console.error("Failed to fetch env vars:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVars();
  }, [fetchVars]);

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)) {
      alert("变量名只能包含字母、数字和下划线，且不能以数字开头");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", key: newKey, value: newValue }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKey("");
        setNewValue("");
        setShowNewValue(false);
        await fetchVars();
      }
    } catch (err) {
      console.error("Failed to add env var:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", key }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchVars();
      }
    } catch (err) {
      console.error("Failed to delete env var:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (key: string, value: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/env-vars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", key, value }),
      });
      const data = await res.json();
      if (data.success) {
        setEntries((prev) =>
          prev.map((e) => (e.key === key ? { ...e, editing: false, newValue: "" } : e))
        );
        await fetchVars();
      }
    } catch (err) {
      console.error("Failed to update env var:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (key: string) => {
    if (visibleValues.has(key)) {
      // Hide
      setVisibleValues((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      // Reveal: fetch actual value if not already cached
      if (!revealedValues[key]) {
        try {
          const res = await fetch(`/api/env-vars?reveal=${encodeURIComponent(key)}`);
          const data = await res.json();
          if (data.success) {
            setRevealedValues((prev) => ({ ...prev, [key]: data.data.value }));
          }
        } catch (err) {
          console.error("Failed to reveal env var:", err);
          return;
        }
      }
      setVisibleValues((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        环境变量会在 shell_exec 执行时自动注入，Skills 脚本可通过 <code className="text-xs bg-muted px-1 py-0.5 rounded">process.env.YOUR_VAR</code> 读取。
      </p>

      {/* 已有变量 */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="flex items-center gap-2 border rounded-lg p-2"
            >
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[120px]">
                {entry.key}
              </code>
              <span className="text-sm text-muted-foreground">=</span>

              {entry.editing ? (
                <>
                  <Input
                    type="text"
                    value={entry.newValue}
                    onChange={(e) =>
                      setEntries((prev) =>
                        prev.map((en) =>
                          en.key === entry.key ? { ...en, newValue: e.target.value } : en
                        )
                      )
                    }
                    className="flex-1 h-8 text-sm font-mono"
                    placeholder="新值"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8"
                    onClick={() => handleUpdate(entry.key, entry.newValue)}
                    disabled={saving}
                  >
                    保存
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      setEntries((prev) =>
                        prev.map((en) =>
                          en.key === entry.key ? { ...en, editing: false, newValue: "" } : en
                        )
                      )
                    }
                  >
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <code
                    className="text-sm font-mono text-muted-foreground flex-1 truncate cursor-pointer hover:text-foreground"
                    onClick={() =>
                      setEntries((prev) =>
                        prev.map((en) =>
                          en.key === entry.key ? { ...en, editing: true } : en
                        )
                      )
                    }
                  >
                    {visibleValues.has(entry.key) ? (revealedValues[entry.key] ?? entry.maskedValue) : "••••••••"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleVisibility(entry.key)}
                  >
                    {visibleValues.has(entry.key) ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(entry.key)}
                    disabled={saving}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && <Separator />}

      {/* 新增变量 */}
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toUpperCase())}
          className="w-[180px] h-8 text-sm font-mono"
          placeholder="变量名 (如 API_KEY)"
        />
        <span className="text-sm text-muted-foreground">=</span>
        <div className="relative flex-1">
          <Input
            type={showNewValue ? "text" : "password"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="h-8 text-sm font-mono pr-8"
            placeholder="值"
          />
          <button
            type="button"
            onClick={() => setShowNewValue(!showNewValue)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showNewValue ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={handleAdd}
          disabled={saving || !newKey.trim()}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          添加
        </Button>
      </div>
    </div>
  );
}
