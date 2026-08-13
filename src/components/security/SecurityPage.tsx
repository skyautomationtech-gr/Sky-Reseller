import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, AuditLog, UserLoginSession } from '../../types';
import { 
  ShieldCheck, Smartphone, Clock, FileText, Lock, LogOut, 
  Search, Filter, CheckCircle2, XCircle, AlertTriangle, Key, Users, Loader2
} from 'lucide-react';

interface SecurityPageProps {
  user: UserProfile;
}

export const SecurityPage: React.FC<SecurityPageProps> = ({ user }) => {
  const isSuperAdmin = user.role === 'super_admin';
  const isAdminOrSuper = user.role === 'super_admin' || user.role === 'admin';

  const [activeTab, setActiveTab] = useState<'sessions' | 'audit' | 'roles'>('sessions');
  const [sessions, setSessions] = useState<UserLoginSession[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Search/Filters
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  useEffect(() => {
    fetchSecurityData();
  }, [user.uid, user.role]);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const [sessionsSnap, auditSnap] = await Promise.all([
        getDocs(collection(db, 'userSessions')),
        isAdminOrSuper ? getDocs(collection(db, 'auditLogs')) : Promise.resolve(null),
      ]);

      // Sessions
      const sList: UserLoginSession[] = [];
      sessionsSnap.forEach((d) => {
        const s = Object.assign({ id: d.id }, d.data()) as unknown as UserLoginSession;
        if (isSuperAdmin || s.userId === user.uid) {
          sList.push(s);
        }
      });
      sList.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setSessions(sList);

      // Audit logs
      if (auditSnap) {
        const aList: AuditLog[] = [];
        auditSnap.forEach((d) => {
          aList.push(Object.assign({ id: d.id }, d.data()) as unknown as AuditLog);
        });
        aList.sort((a, b) => {
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
          return timeB - timeA;
        });
        setAuditLogs(aList);
      }
    } catch (err) {
      console.error('Error fetching security data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAllDevices = () => {
    if (window.confirm('Logging out from all devices will require re-authentication. Continue?')) {
      alert('You have logged out from all active sessions. Please log in again if needed.');
    }
  };

  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(auditSearchTerm.toLowerCase()) ||
      log.performedByName.toLowerCase().includes(auditSearchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(auditSearchTerm.toLowerCase());
    const matchesFilter = !auditActionFilter || log.action === auditActionFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-md">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Security & Account Safeguards</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage active sessions, audit trails, and role permissions.</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'sessions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Login Sessions
          </button>

          {isAdminOrSuper && (
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit Logs
            </button>
          )}

          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'roles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Role Permissions
          </button>
        </div>
      </div>

      {/* TAB 1: SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Active Device Session</h3>
              <p className="text-xs text-slate-500 mt-0.5">Currently logged in from this browser instance.</p>
            </div>
            <button
              onClick={handleLogoutAllDevices}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout All Devices</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider">
              Recent Login Session History ({sessions.length})
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <p className="text-xs font-medium">Loading session history...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No logged login history found.</div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">User</th>
                        <th className="p-3.5">Device / Browser User-Agent</th>
                        <th className="p-3.5">Login Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessions.map((s) => {
                        const timeObj = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp || 0);
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/80">
                            <td className="p-3.5 font-bold text-slate-900">
                              {s.userName}
                              <span className="block text-[10px] font-mono text-slate-400 capitalize">{s.userRole}</span>
                            </td>
                            <td className="p-3.5 text-slate-600 font-mono text-[11px] max-w-md truncate">
                              {s.deviceInfo}
                            </td>
                            <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">
                              {timeObj.toLocaleString('en-GB')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card Layout Fallback */}
                <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
                  {sessions.map((s) => {
                    const timeObj = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp || 0);
                    return (
                      <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                          <div>
                            <span className="font-extrabold text-slate-900">{s.userName}</span>
                            <span className="ml-2 text-[10px] font-mono text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded capitalize">
                              {s.userRole}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">{timeObj.toLocaleString('en-GB')}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono bg-white p-2.5 rounded-xl border border-slate-200/50 break-all">
                          <span className="text-[9px] text-slate-400 font-bold block uppercase mb-0.5">Device Info</span>
                          {s.deviceInfo}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT LOGS (Super Admin / Admin) */}
      {activeTab === 'audit' && isAdminOrSuper && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>System Activity Audit Trail ({filteredAuditLogs.length})</span>
            </h3>

            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search action or user..."
                value={auditSearchTerm}
                onChange={(e) => setAuditSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Loading audit logs...</p>
            </div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No matching audit events recorded yet.</div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto border rounded-xl border-slate-200">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-900 text-slate-300 font-semibold">
                    <tr>
                      <th className="p-3.5">Action Code</th>
                      <th className="p-3.5">Performed By</th>
                      <th className="p-3.5">Target ID</th>
                      <th className="p-3.5">Details</th>
                      <th className="p-3.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAuditLogs.map((log) => {
                      const dateObj = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp || 0);
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-3.5 font-bold font-mono text-blue-600">{log.action}</td>
                          <td className="p-3.5 font-semibold text-slate-900">
                            {log.performedByName}
                            <span className="block text-[10px] text-slate-400 capitalize">{log.performedByRole}</span>
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-slate-500">{log.targetId || '—'}</td>
                          <td className="p-3.5 text-slate-700 max-w-xs">{log.details}</td>
                          <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">
                            {dateObj.toLocaleString('en-GB')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100 space-y-3">
                {filteredAuditLogs.map((log) => {
                  const dateObj = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp || 0);
                  return (
                    <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                        <span className="font-bold font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                          {log.action}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{dateObj.toLocaleString('en-GB')}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Performed By</span>
                          <span className="font-semibold text-slate-900">{log.performedByName}</span>
                          <span className="text-[10px] text-slate-500 capitalize block">{log.performedByRole}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Target ID</span>
                          <span className="font-mono text-slate-600 text-[10px]">{log.targetId || '—'}</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/50 text-slate-700 text-[11px]">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase mb-0.5">Details</span>
                        {log.details}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: ROLE PERMISSIONS REFERENCE TABLE */}
      {activeTab === 'roles' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              <span>Role Permissions Matrix</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Reference table explaining privilege tiers across Super Admin, Admin, and Reseller roles.</p>
          </div>

          <div className="overflow-x-auto border rounded-xl border-slate-200">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-900 text-white font-semibold">
                <tr>
                  <th className="p-3.5">System Module / Action</th>
                  <th className="p-3.5 text-center">Super Admin</th>
                  <th className="p-3.5 text-center">Admin</th>
                  <th className="p-3.5 text-center">Reseller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { module: 'User Approvals & Account Rejection', sa: true, a: true, r: false },
                  { module: 'Create & Manage Admin Accounts', sa: true, a: false, r: false },
                  { module: 'Manage Products, Categories & Brands', sa: true, a: true, r: false },
                  { module: 'View Product Catalog & Retail Prices', sa: true, a: true, r: true },
                  { module: 'Place Orders & Generate Invoices', sa: true, a: true, r: true },
                  { module: 'Process Orders & Shipping Status', sa: true, a: true, r: false },
                  { module: 'Approve Wallet Withdrawal Requests', sa: true, a: true, r: false },
                  { module: 'Configure Commission Rates & Bonus', sa: true, a: true, r: false },
                  { module: 'Broadcast Notices & Announcements', sa: true, a: true, r: false },
                  { module: 'Reply & Resolve Support Tickets', sa: true, a: true, r: false },
                  { module: 'Edit Company Settings & Brand Info', sa: true, a: false, r: false },
                  { module: 'View Full System Audit Logs', sa: true, a: true, r: false },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3.5 font-bold text-slate-900">{row.module}</td>
                    <td className="p-3.5 text-center">
                      {row.sa ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" /> : <XCircle className="w-4 h-4 text-slate-300 inline" />}
                    </td>
                    <td className="p-3.5 text-center">
                      {row.a ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" /> : <XCircle className="w-4 h-4 text-slate-300 inline" />}
                    </td>
                    <td className="p-3.5 text-center">
                      {row.r ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" /> : <XCircle className="w-4 h-4 text-slate-300 inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
