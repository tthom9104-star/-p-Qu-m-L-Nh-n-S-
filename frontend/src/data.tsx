/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Attendance, Candidate, Dept, Employee, Job, Leave, Notification, Training } from './types';

export interface Store {
  emps: Employee[]; depts: Dept[]; leaves: Leave[]; att: Attendance[]; jobs: Job[]; cands: Candidate[];
  trainings: Training[]; notifications: Notification[];
  reviews: Record<number, number>; loading: boolean; loaded: boolean; error: string; reload: () => Promise<void>;
}
const Ctx = createContext<Store>(null as unknown as Store);
export const useData = () => useContext(Ctx);

export function DataProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<Store, 'reload'>>({
    emps: [], depts: [], leaves: [], att: [], jobs: [], cands: [], trainings: [], notifications: [],
    reviews: {}, loading: true, loaded: false, error: '',
  });

  const reload = useCallback(async () => {
    try {
      const [emps, depts, leaves, att, jobs, cands, rev, trainings, notifications] = await Promise.all([
        api.get<Employee[]>('/api/employees'), api.get<Dept[]>('/api/departments'), api.get<Leave[]>('/api/leaves'),
        api.get<Attendance[]>('/api/attendance'), api.get<Job[]>('/api/jobs'), api.get<Candidate[]>('/api/candidates'),
        api.get<{ eid: number; score: number }[]>('/api/reviews'),
        api.get<Training[]>('/api/trainings'), api.get<Notification[]>('/api/notifications'),
      ]);
      setS({
        emps, depts, leaves, att, jobs, cands, trainings, notifications,
        reviews: Object.fromEntries(rev.map(r => [r.eid, r.score])), loading: false, loaded: true, error: '',
      });
    } catch (e) {
      setS(p => ({ ...p, loading: false, error: e instanceof Error ? e.message : 'Không tải được dữ liệu' }));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return <Ctx.Provider value={{ ...s, reload }}>{children}</Ctx.Provider>;
}
