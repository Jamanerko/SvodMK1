import { useState, useEffect, useCallback } from 'react';
import { Shield, Phone, Copy, Check, ExternalLink, UserCheck, Ban, RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import type { AppUser } from '@/lib/AuthContext';

interface AccessRequest {
  id: string;
  phone: string;
  status: string;
  created_at: string;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function AccessControl() {
  const [tab, setTab] = useState<'requests' | 'users'>('requests');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedPasswords, setGeneratedPasswords] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: usrs }] = await Promise.all([
      supabase.from('access_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('app_users').select('*').order('created_at'),
    ]);
    setRequests((reqs || []) as AccessRequest[]);
    setUsers((usrs || []) as AppUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async (req: AccessRequest) => {
    const pwd = generatePassword();
    const { error } = await supabase
      .from('app_users')
      .upsert({ phone: req.phone, password: pwd, is_admin: false }, { onConflict: 'phone' });
    if (error) { alert('Ошибка создания пользователя'); return; }

    await supabase.from('access_requests').update({ status: 'approved' }).eq('id', req.id);
    setGeneratedPasswords((prev) => ({ ...prev, [req.id]: pwd }));
    await load();
    setTab('users');
  };

  const handleBlock = async (userId: string) => {
    if (!confirm('Заблокировать пользователя? Он будет немедленно разлогинен.')) return;
    await supabase.from('app_users').update({ is_blocked: true, is_online: false }).eq('id', userId);
    await load();
  };

  const handleUnblock = async (userId: string) => {
    await supabase.from('app_users').update({ is_blocked: false }).eq('id', userId);
    await load();
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 2000);
  };

  if (loading) return <LoadingSpinner />;

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <PageContainer>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
          <Shield className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-800">Управление доступом</h2>
          <p className="text-xs text-slate-500">Заявки и пользователи системы</p>
        </div>
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Обновить">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <Card>
        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setTab('requests')}
            className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
              tab === 'requests'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Новые заявки
            {pendingRequests.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
              tab === 'users'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Пользователи
            <span className="text-xs text-slate-400">({users.length})</span>
          </button>
        </div>

        {tab === 'requests' ? (
          pendingRequests.length === 0 ? (
            <EmptyState icon={Phone} message="Новых заявок нет" />
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingRequests.map((req) => {
                const pwd = generatedPasswords[req.id];
                const cleanPhone = req.phone.replace(/\D/g, '');
                const waLink = `https://wa.me/${cleanPhone}`;
                return (
                  <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{req.phone}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(req.created_at).toLocaleString('ru-RU')}
                        </div>
                      </div>
                    </div>

                    {pwd ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                          <span className="font-mono font-bold text-slate-800 text-sm">{pwd}</span>
                          <button
                            onClick={() => copyToClipboard(pwd, `pwd-${req.id}`)}
                            className="text-slate-500 hover:text-slate-700"
                            title="Скопировать пароль"
                          >
                            {copied[`pwd-${req.id}`]
                              ? <Check className="w-4 h-4 text-green-600" />
                              : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <a
                          href={`${waLink}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                        <Badge color="bg-green-100 text-green-700">Одобрено</Badge>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerate(req)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                      >
                        <UserCheck className="w-4 h-4" />
                        Сгенерировать доступ
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          users.length === 0 ? (
            <EmptyState icon={Shield} message="Нет пользователей" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Телефон</th>
                    <th className="text-left px-4 py-2.5 font-medium">Пароль</th>
                    <th className="text-left px-4 py-2.5 font-medium">Роль</th>
                    <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                    <th className="text-left px-4 py-2.5 font-medium">Последний вход</th>
                    <th className="text-left px-4 py-2.5 font-medium">WhatsApp</th>
                    <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{u.phone}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-700 bg-slate-100 rounded px-2 py-0.5 text-xs">
                            {u.password}
                          </span>
                          <button
                            onClick={() => copyToClipboard(u.password, `user-${u.id}`)}
                            className="text-slate-400 hover:text-slate-600"
                            title="Скопировать"
                          >
                            {copied[`user-${u.id}`]
                              ? <Check className="w-3.5 h-3.5 text-green-600" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={u.is_admin ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}>
                          {u.is_admin ? 'Администратор' : 'Пользователь'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_blocked ? (
                          <Badge color="bg-red-100 text-red-700">
                            <Ban className="w-3 h-3 inline mr-1" />Заблокирован
                          </Badge>
                        ) : u.is_online ? (
                          <Badge color="bg-green-100 text-green-700">
                            <Wifi className="w-3 h-3 inline mr-1" />В сети
                          </Badge>
                        ) : (
                          <Badge color="bg-slate-100 text-slate-500">
                            <WifiOff className="w-3 h-3 inline mr-1" />Оффлайн
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {u.last_login_at
                          ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(u.last_login_at).toLocaleString('ru-RU')}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://wa.me/${u.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          WhatsApp
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.is_admin ? (
                          <span className="text-xs text-slate-400 italic">Защищён</span>
                        ) : u.is_blocked ? (
                          <button
                            onClick={() => handleUnblock(u.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Восстановить
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlock(u.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Перекрыть доступ
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </PageContainer>
  );
}
