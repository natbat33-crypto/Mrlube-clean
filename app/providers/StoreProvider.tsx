"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getResolvedStore } from "@/lib/getStoreId";

type StoreCtx = { storeId?: string; role?: string; loading: boolean };
const Ctx = createContext<StoreCtx>({ loading: true });
export const useStoreCtx = () => useContext(Ctx);

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreCtx>({ loading: true });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setState({ loading: false });
        return;
      }

      const resolved = await getResolvedStore();
      setState({
        loading: false,
        storeId: resolved?.storeId,
        role: resolved?.role,
      });
    });

    return () => unsub();
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

