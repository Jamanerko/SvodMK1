import { useState } from 'react';
import { Truck, Phone, Lock, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

type Tab = 'request' | 'login';

export default function LoginScreen() {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>('login');

  // Request form
  const [reqPhone, setReqPhone] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);
  const [reqError, setReqError] = useState('');

  // Login form
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleRequest = async () => {
    if (!reqPhone.trim()) { setReqError('Введите номер телефона'); return; }
    setReqLoading(true);
    setReqError('');
    const { error } = await supabase
      .from('access_requests')
      .upsert({ phone: reqPhone.trim(), status: 'pending' }, { onConflict: 'phone' });
    setReqLoading(false);
    if (error) {
      setReqError('Ошибка отправки заявки. Попробуйте ещё раз.');
    } else {
      setReqSuccess(true);
    }
  };

  const handleLogin = async () => {
    if (!loginPhone.trim() || !loginPassword.trim()) {
      setLoginError('Введите номер телефона и пароль');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    const { error } = await login(loginPhone, loginPassword);
    setLoginLoading(false);
    if (error) setLoginError(error);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mb-4">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">СМК-Строй</h1>
          <p className="text-slate-400 text-sm mt-1">Управление материалами</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {(['login', 'request'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'login' ? 'Вход по паролю' : 'Заявка на доступ'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'login' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Номер телефона</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={loginPhone}
                      onChange={(e) => { setLoginPhone(e.target.value); setLoginError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="+7 (999) 000-00-00"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Пароль</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="Введите пароль"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                {loginError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {loginError}
                  </div>
                )}
                <button
                  onClick={handleLogin}
                  disabled={loginLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loginLoading ? 'Вход...' : 'Войти'}
                </button>
                <p className="text-center text-xs text-slate-400">
                  Нет пароля?{' '}
                  <button onClick={() => setTab('request')} className="text-blue-600 hover:underline">
                    Подайте заявку
                  </button>
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reqSuccess ? (
                  <div className="text-center py-4 space-y-3">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                      <CheckCircle className="w-7 h-7 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-slate-800">Заявка принята!</h3>
                    <p className="text-sm text-slate-500">
                      Ожидайте пароль в <span className="font-medium text-green-600">WhatsApp</span>.<br />
                      После получения войдите через вкладку «Вход по паролю».
                    </p>
                    <button
                      onClick={() => { setTab('login'); setReqSuccess(false); setReqPhone(''); }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Перейти ко входу
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-500">
                      Введите ваш номер телефона. Администратор свяжется с вами в WhatsApp и отправит пароль для входа.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Номер телефона</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="tel"
                          value={reqPhone}
                          onChange={(e) => { setReqPhone(e.target.value); setReqError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && handleRequest()}
                          placeholder="+7 (999) 000-00-00"
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    {reqError && (
                      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {reqError}
                      </div>
                    )}
                    <button
                      onClick={handleRequest}
                      disabled={reqLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {reqLoading ? 'Отправка...' : 'Отправить заявку'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
