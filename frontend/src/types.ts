export interface Employee { id: number; name: string; email: string; phone: string; dept: string; pos: string; salary: number; gender: string; status: string; join_date: string }
export interface Dept { id: number; name: string }
export interface Leave { id: number; eid: number; from_date: string; to_date: string; reason: string; status: string }
export interface Attendance { id: number; eid: number; date: string; time_in: string | null; time_out: string | null }
export interface Job { id: number; title: string }
export interface Candidate { id: number; name: string; job_id: number; stage: number }
export type EmployeeInput = Omit<Employee, 'id'>;
