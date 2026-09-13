"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/db/browser";

/**
 * Refreshes the server-rendered thread when a new message lands (Supabase Realtime on `messages`,
 * filtered to this conversation; RLS limits the events to the user's own account).
 * Also listens to `conversations` so AI pause/status flips from the core loop show up live.
 */
export function ConversationRealtime({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof createBrowserSupabase>;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 150);
    };
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` }, refresh)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}

/** Inbox list: refresh when any conversation of the account changes (RLS scopes the stream). */
export function InboxRealtime({ accountId }: { accountId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof createBrowserSupabase>;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel(`inbox:${accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `account_id=eq.${accountId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `account_id=eq.${accountId}` }, refresh)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [accountId, router]);

  return null;
}
