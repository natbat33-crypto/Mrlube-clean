"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSupervisorTrainees } from "@/lib/useSupervisorTrainees";

type Ctx = {
  traineeId: string | null;
};

const SupervisorSelectionCtx = createContext<Ctx>({ traineeId: null });

export function SupervisorSelectionProvider({
  storeId,
  children,
}: {
  storeId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const trainees = useSupervisorTrainees(storeId);
  const [traineeId, setTraineeId] = useState<string | null>(asParam);

  // Sync from URL
  useEffect(() => {
    if (asParam) {
      setTraineeId(asParam);
      localStorage.setItem("reviewUid", asParam);
    }
  }, [asParam]);

  // 🔑 THIS IS THE MAGIC
  useEffect(() => {
    if (traineeId) return;
    if (trainees.length === 1) {
      const id = trainees[0].traineeId;
      setTraineeId(id);
      localStorage.setItem("reviewUid", id);
      router.replace(`/supervisor?as=${id}`);
    }
  }, [trainees, traineeId, router]);

  return (
    <SupervisorSelectionCtx.Provider value={{ traineeId }}>
      {children}
    </SupervisorSelectionCtx.Provider>
  );
}

export function useSupervisorSelection() {
  return useContext(SupervisorSelectionCtx);
}



