"use client";

import { useState } from "react";
import { Server, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, setToken, clearToken, API } from "@/lib/api";

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [token, setTokenValue] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      setToken(token);
      await api(API.SYSTEM);
      onLogin();
    } catch {
      setError(true);
      clearToken();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[420px]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 w-12 h-12 bg-gradient-to-br from-ship-500 to-ship-700 rounded-2xl flex items-center justify-center">
            <Server className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">Matrx Server Manager</CardTitle>
          <CardDescription>Enter your token to access the admin dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-destructive text-sm text-center">Invalid or expired token</p>}
          <Input
            type="password"
            value={token}
            onChange={(e) => { setTokenValue(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Bearer token..."
            className="font-mono"
            autoFocus
          />
          <Button onClick={handleLogin} disabled={loading} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />} Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
