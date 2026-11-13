export interface Employee { id: number; name: string; email: string; phone: string; dept: string; pos: string; salary: number; gender: string; status: string; join_date: string }
export interface Dept { id: number; name: string }
export interface Leave { id: number; eid: number; from_date: string; to_date: string; reason: string; status: string }
export interface Attendance { id: number; eid: number; date: string; time_in: string | null; time_out: string | null }
export interface Job { id: number; title: string }
export interface Candidate { id: number; name: string; job_id: number; stage: number }
export interface Training { id: number; eid: number; title: string; description: string; from_date: string; to_date: string; status: string }
export interface Notification { id: number; title: string; message: string; type: string; created_at: string; read_at: string | null }
export interface User { id: number; username: string; role: 'admin' | 'hr' | 'viewer'; active: boolean | number; created_at: string }
export type EmployeeInput = Omit<Employee, 'id'>;
