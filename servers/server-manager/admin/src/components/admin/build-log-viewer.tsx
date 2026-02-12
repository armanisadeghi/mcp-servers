"use client";

import { useState } from "react";
import { Terminal, Loader2, CheckCircle2, AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface BuildLogViewerProps {
  buildLogs: string[];
  buildPhase: string | null;
  deploying: boolean;
  deployingMgr: boolean;
  onClear: () => void;
}

export function BuildLogViewer({ buildLogs, buildPhase, deploying, deployingMgr, onClear }: BuildLogViewerProps) {
  const [logsCopied, setLogsCopied] = useState(false);

  if (buildLogs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="size-4" /> Build Output
            {(deploying || deployingMgr) && <Loader2 className="size-4 animate-spin text-primary" />}
            {buildPhase === "done" && <CheckCircle2 className="size-4 text-success" />}
            {buildPhase === "error" && <AlertTriangle className="size-4 text-destructive" />}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(buildLogs.join("\n"));
                setLogsCopied(true);
                setTimeout(() => setLogsCopied(false), 2000);
                toast.success("Build logs copied to clipboard");
              }}
            >
              {logsCopied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              {logsCopied ? "Copied" : "Copy"}
            </Button>
            {!deploying && !deployingMgr && (
              <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
          className="bg-zinc-950 text-zinc-300 rounded-lg p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-0.5"
        >
          {buildLogs.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("──")
                  ? "text-blue-400 font-semibold py-1"
                  : line.includes("error") || line.includes("ERROR") || line.includes("FAILED")
                    ? "text-red-400"
                    : line.includes("restarted") || line.includes("success")
                      ? "text-green-400"
                      : "text-zinc-400"
              }
            >
              {line}
            </div>
          ))}
          {(deploying || deployingMgr) && <div className="text-zinc-500 animate-pulse">waiting for output...</div>}
        </div>
      </CardContent>
    </Card>
  );
}
