import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  OperationType, 
  handleFirestoreError, 
  testConnection,
  runTransaction
} from './firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp, 
  updateDoc, 
  doc, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { 
  Users, 
  UserPlus, 
  LogIn, 
  LogOut, 
  Search, 
  ClipboardList, 
  Info, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Wifi, 
  MapPin, 
  ShieldCheck,
  ChevronRight,
  Plus,
  ArrowRight,
  ArrowLeft,
  QrCode,
  Camera,
  X,
  Menu,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Visitor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  purpose?: string;
  hostName?: string;
  checkInTime?: Timestamp;
  checkOutTime?: Timestamp;
  status: 'invited' | 'checked-in' | 'checked-out';
  invitationId?: string;
  documents?: string[];
  photoUrl?: string;
  createdAt: Timestamp;
}

interface Invitation {
  id: string;
  visitorName: string;
  visitorEmail: string;
  hostName: string;
  hostEmail: string;
  scheduledDate: Timestamp;
  purpose?: string;
  code: string;
  status: 'pending' | 'pre-registered' | 'used' | 'expired';
  documents?: string[];
  createdAt: Timestamp;
}

// Components
const Card = ({ children, className }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div className={cn("bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  type = 'button',
  title
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "bg-slate-800 text-white hover:bg-slate-900",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100"
  };

  return (
    <button 
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text',
  required = false
}: { 
  label: string; 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string;
  type?: string;
  required?: boolean;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-slate-700">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
    />
  </div>
);

const QRScanner = ({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScan(decodedText);
        scanner.clear();
      },
      (error) => {
        // console.warn(error);
      }
    );

    return () => {
      scanner.clear().catch(error => console.error("Failed to clear scanner", error));
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Scan QR Code</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-6">
          <div id="reader" className="w-full overflow-hidden rounded-xl border border-slate-200"></div>
          <p className="text-center text-sm text-slate-500 mt-4">Position the QR code within the frame to scan.</p>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invite' | 'checkin' | 'log' | 'info' | 'visitor-portal'>('dashboard');
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Visitor Portal states
  const [visitorCode, setVisitorCode] = useState('');
  const [currentInvitation, setCurrentInvitation] = useState<Invitation | null>(null);
  const [preRegForm, setPreRegForm] = useState({
    phone: '',
    purpose: '',
    documentName: '',
    documents: [] as string[]
  });
  const [isUploading, setIsUploading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [preRegComplete, setPreRegComplete] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Form states
  const [inviteForm, setInviteForm] = useState({
    visitorName: '',
    visitorEmail: '',
    hostName: '',
    hostEmail: '',
    scheduledDate: '',
    purpose: ''
  });

  const [checkInForm, setCheckInForm] = useState({
    code: '',
    name: '',
    email: '',
    phone: '',
    purpose: '',
    hostName: '',
    photo: ''
  });

  useEffect(() => {
    testConnection();
    
    // Handle URL parameters for invitations
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const tab = params.get('tab');

    if (code) {
      setVisitorCode(code.toUpperCase());
      setActiveTab('visitor-portal');
      // Clear URL params without refreshing to keep it clean
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (tab === 'visitor-portal') {
      setActiveTab('visitor-portal');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const vQuery = query(collection(db, 'visitors'), orderBy('createdAt', 'desc'));
    const vUnsubscribe = onSnapshot(vQuery, (snapshot) => {
      setVisitors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Visitor)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visitors'));

    const iQuery = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const iUnsubscribe = onSnapshot(iQuery, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invitation)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'invitations'));

    return () => {
      vUnsubscribe();
      iUnsubscribe();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const createInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const code = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'invitations');
        const counterDoc = await transaction.get(counterRef);
        
        let newCount = 1001;
        if (counterDoc.exists()) {
          newCount = counterDoc.data().count + 1;
        }
        
        transaction.set(counterRef, { count: newCount });
        
        const formattedCode = `CP-${newCount.toString().padStart(6, '0')}`;
        const invitationRef = doc(collection(db, 'invitations'));
        
        transaction.set(invitationRef, {
          ...inviteForm,
          scheduledDate: Timestamp.fromDate(new Date(inviteForm.scheduledDate)),
          code: formattedCode,
          status: 'pending',
          createdAt: Timestamp.now()
        });
        
        return formattedCode;
      });

      alert(`Invitation created! Code: ${code}`);
      setInviteForm({
        visitorName: '',
        visitorEmail: '',
        hostName: '',
        hostEmail: '',
        scheduledDate: '',
        purpose: ''
      });
      setActiveTab('dashboard');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'invitations');
    }
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      let invitationId = '';
      if (checkInForm.code) {
        const q = query(collection(db, 'invitations'), where('code', '==', checkInForm.code.toUpperCase()), where('status', 'in', ['pending', 'pre-registered']));
        const snap = await getDocs(q);
        if (snap.empty) {
          alert("Invalid or already used invitation code.");
          return;
        }
        const invDoc = snap.docs[0];
        const invData = invDoc.data() as Invitation;
        invitationId = invDoc.id;
        await updateDoc(doc(db, 'invitations', invitationId), { status: 'used' });
        
        // Use documents from invitation if available
        if (invData.documents) {
          (checkInForm as any).documents = invData.documents;
        }
      }

      await addDoc(collection(db, 'visitors'), {
        name: checkInForm.name,
        email: checkInForm.email,
        phone: checkInForm.phone,
        purpose: checkInForm.purpose,
        hostName: checkInForm.hostName,
        checkInTime: Timestamp.now(),
        status: 'checked-in',
        invitationId,
        documents: (checkInForm as any).documents || [],
        photoUrl: checkInForm.photo || '',
        createdAt: Timestamp.now()
      });

      alert("Check-in successful!");
      setCheckInForm({ code: '', name: '', email: '', phone: '', purpose: '', hostName: '', photo: '' });
      setActiveTab('dashboard');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'visitors');
    }
  };

  const handleCheckOut = async (visitorId: string) => {
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        status: 'checked-out',
        checkOutTime: Timestamp.now()
      });
      alert("Checked out successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `visitors/${visitorId}`);
    }
  };

  const findInvitation = async () => {
    if (!checkInForm.code) return;
    try {
      const q = query(collection(db, 'invitations'), where('code', '==', checkInForm.code.toUpperCase()), where('status', 'in', ['pending', 'pre-registered']));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as Invitation;
        setCheckInForm({
          ...checkInForm,
          name: data.visitorName,
          email: data.visitorEmail,
          purpose: data.purpose || '',
          hostName: data.hostName
        });
      } else {
        alert("Invitation not found or already used.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'invitations');
    }
  };

  const findInvitationForPortal = async () => {
    if (!visitorCode) return;
    try {
      const q = query(collection(db, 'invitations'), where('code', '==', visitorCode.toUpperCase()), where('status', '==', 'pending'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setCurrentInvitation({ id: snap.docs[0].id, ...snap.docs[0].data() } as Invitation);
      } else {
        alert("Invitation not found or already pre-registered.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'invitations');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newDocuments: string[] = [...preRegForm.documents];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 500 * 1024) { // 500KB limit per file for Firestore
        alert(`File ${file.name} is too large. Please upload files smaller than 500KB.`);
        continue;
      }

      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      
      const base64 = await promise;
      newDocuments.push(base64);
    }

    setPreRegForm({ ...preRegForm, documents: newDocuments });
    setIsUploading(false);
  };

  const removeDocument = (index: number) => {
    const newDocs = [...preRegForm.documents];
    newDocs.splice(index, 1);
    setPreRegForm({ ...preRegForm, documents: newDocs });
  };

  const handlePreRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentInvitation) return;

    try {
      await updateDoc(doc(db, 'invitations', currentInvitation.id), {
        status: 'pre-registered',
        phone: preRegForm.phone,
        purpose: preRegForm.purpose || currentInvitation.purpose,
        documents: preRegForm.documents,
        documentName: preRegForm.documentName
      });
      setPreRegComplete(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invitations/${currentInvitation.id}`);
    }
  };

  const copyInviteLink = (code: string) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const inviteUrl = `${baseUrl}?code=${code}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      alert("Invitation link copied to clipboard!");
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const stats = {
    totalToday: visitors.filter(v => v.createdAt.toDate().toDateString() === new Date().toDateString()).length,
    currentlyIn: visitors.filter(v => v.status === 'checked-in').length,
    pendingInvites: invitations.filter(i => i.status === 'pending' || i.status === 'pre-registered').length
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {user && (
        <>
          {/* Mobile Header */}
          <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg">VisitorPro</span>
            </div>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg">
              {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Sidebar */}
          <aside className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}>
            <div className="p-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-white text-lg">VisitorPro</span>
            </div>

            <nav className="flex-1 px-4 space-y-1">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: ClipboardList },
                { id: 'invite', label: 'Pre-Invite', icon: UserPlus },
                { id: 'checkin', label: 'Check-In', icon: LogIn },
                { id: 'log', label: 'Visitor Log', icon: Users },
                { id: 'info', label: 'Campus Info', icon: Info },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                    activeTab === item.id 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                      : "hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-4 border-t border-slate-800">
              <div className="flex items-center gap-3 px-4 py-3">
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-700" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 hover:text-red-400 transition-all text-slate-400"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </aside>

          {/* Overlay for mobile sidebar */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40 md:hidden" 
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </>
      )}

      {/* Main Content */}
      <main className={cn("flex-1 overflow-y-auto p-4 md:p-8", !user && "flex items-center justify-center")}>
        <AnimatePresence mode="wait">
          {!user && activeTab !== 'visitor-portal' && activeTab !== 'info' ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md w-full text-center space-y-8"
            >
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200">
                  <ShieldCheck className="w-12 h-12 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Campus Visitor Pro</h1>
                <p className="text-slate-500 text-lg">Secure, professional, and efficient visitor management for your campus.</p>
              </div>
              <Button onClick={handleLogin} className="w-full py-4 text-lg shadow-lg shadow-indigo-100">
                <LogIn className="w-5 h-5" />
                Sign in with Google
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200"></span></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-50 px-2 text-slate-500">Visitor?</span></div>
              </div>
              <Button onClick={() => setActiveTab('visitor-portal')} variant="outline" className="w-full py-4 text-lg">
                <UserPlus className="w-5 h-5" />
                Pre-Register with Code
              </Button>
              <Button onClick={() => setActiveTab('info')} variant="ghost" className="w-full py-4 text-slate-500 hover:text-indigo-600">
                <Info className="w-5 h-5" />
                View Campus Info
              </Button>
              <p className="text-xs text-slate-400">Authorized personnel only. Access is monitored and recorded.</p>
            </motion.div>
          ) : (
            <>
              {activeTab === 'dashboard' && user && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8 w-full"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Dashboard</h2>
                      <p className="text-slate-500">Welcome back, {user.displayName?.split(' ')[0]}.</p>
                    </div>
                    <div className="flex gap-2 sm:gap-3">
                      <Button onClick={() => setActiveTab('checkin')} variant="primary" className="flex-1 sm:flex-none">
                        <LogIn className="w-4 h-4" />
                        Check-In
                      </Button>
                      <Button onClick={() => setActiveTab('invite')} variant="outline" className="flex-1 sm:flex-none">
                        <UserPlus className="w-4 h-4" />
                        Invite
                      </Button>
                    </div>
                  </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: "Today's Visitors", value: stats.totalToday, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Currently On-Campus", value: stats.currentlyIn, icon: Clock, color: "text-green-600", bg: "bg-green-50" },
                  { label: "Pending Invitations", value: stats.pendingInvites, icon: Calendar, color: "text-amber-600", bg: "bg-amber-50" },
                ].map((stat, i) => (
                  <Card key={i} className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                        <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
                      </div>
                      <div className={cn("p-3 rounded-xl", stat.bg)}>
                        <stat.icon className={cn("w-6 h-6", stat.color)} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">Recent Check-Ins</h3>
                    <button onClick={() => setActiveTab('log')} className="text-indigo-600 text-sm font-medium hover:underline">View All</button>
                  </div>
                  <div className="flex-1">
                    {visitors.filter(v => v.status === 'checked-in').slice(0, 5).map((visitor) => (
                      <div key={visitor.id} className="p-4 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600">
                            {visitor.name[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{visitor.name}</p>
                            <p className="text-xs text-slate-500">Host: {visitor.hostName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-900">{format(visitor.checkInTime?.toDate() || new Date(), 'h:mm a')}</p>
                          <button 
                            onClick={() => handleCheckOut(visitor.id)}
                            className="text-xs text-red-600 font-medium hover:underline"
                          >
                            Check Out
                          </button>
                        </div>
                      </div>
                    ))}
                    {visitors.filter(v => v.status === 'checked-in').length === 0 && (
                      <div className="p-12 text-center text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No visitors currently on campus</p>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">Upcoming Invitations</h3>
                    <button onClick={() => setActiveTab('invite')} className="text-indigo-600 text-sm font-medium hover:underline">Manage</button>
                  </div>
                  <div className="flex-1">
                    {invitations.filter(i => i.status === 'pending' || i.status === 'pre-registered').slice(0, 5).map((invite) => (
                      <div key={invite.id} className="p-4 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                            invite.status === 'pre-registered' ? "bg-green-50 text-green-600" : "bg-indigo-50 text-indigo-600"
                          )}>
                            {invite.visitorName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{invite.visitorName}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-slate-500">{format(invite.scheduledDate.toDate(), 'MMM d, yyyy')}</p>
                              {invite.status === 'pre-registered' && (
                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase">Pre-Reg</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold font-mono">
                            {invite.code}
                          </span>
                          <button 
                            onClick={() => copyInviteLink(invite.code)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Copy Invite Link"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {invitations.filter(i => i.status === 'pending').length === 0 && (
                      <div className="p-12 text-center text-slate-400">
                        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No pending invitations</p>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="p-6 bg-indigo-600 text-white md:col-span-2 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-200">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                      <Info className="w-8 h-8 text-white" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold">Campus Information</h3>
                      <p className="text-indigo-100 text-sm">Access Wi-Fi credentials, directions, and safety & security protocols.</p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => setActiveTab('info')} 
                    className="bg-white text-indigo-600 hover:bg-indigo-50 w-full md:w-auto px-8 py-3 font-bold"
                  >
                    View Protocols
                  </Button>
                </Card>
              </div>
            </motion.div>
          )}

              {activeTab === 'invite' && user && (
                <motion.div 
                  key="invite"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="max-w-2xl mx-auto space-y-8 w-full"
                >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Pre-Invite Visitor</h2>
                <p className="text-slate-500">Generate a secure entry code for your upcoming visitor.</p>
              </div>

              <Card className="p-8">
                <form onSubmit={createInvitation} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input 
                      label="Visitor Name" 
                      value={inviteForm.visitorName} 
                      onChange={(v) => setInviteForm({...inviteForm, visitorName: v})} 
                      placeholder="e.g. John Doe"
                      required
                    />
                    <Input 
                      label="Visitor Email" 
                      value={inviteForm.visitorEmail} 
                      onChange={(v) => setInviteForm({...inviteForm, visitorEmail: v})} 
                      placeholder="john@example.com"
                      type="email"
                      required
                    />
                    <Input 
                      label="Host Name" 
                      value={inviteForm.hostName} 
                      onChange={(v) => setInviteForm({...inviteForm, hostName: v})} 
                      placeholder="Your Name"
                      required
                    />
                    <Input 
                      label="Host Email" 
                      value={inviteForm.hostEmail} 
                      onChange={(v) => setInviteForm({...inviteForm, hostEmail: v})} 
                      placeholder="your@email.com"
                      type="email"
                      required
                    />
                    <Input 
                      label="Scheduled Date" 
                      value={inviteForm.scheduledDate} 
                      onChange={(v) => setInviteForm({...inviteForm, scheduledDate: v})} 
                      type="datetime-local"
                      required
                    />
                    <Input 
                      label="Purpose of Visit" 
                      value={inviteForm.purpose} 
                      onChange={(v) => setInviteForm({...inviteForm, purpose: v})} 
                      placeholder="e.g. Technical Interview"
                    />
                  </div>
                  <Button type="submit" className="w-full py-3 text-lg">
                    <Plus className="w-5 h-5" />
                    Create Invitation
                  </Button>
                </form>
              </Card>

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-900">Active Invitations</h3>
                <div className="grid grid-cols-1 gap-4">
                  {invitations.filter(i => i.status === 'pending' || i.status === 'pre-registered').map((invite) => (
                    <Card key={invite.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                          invite.status === 'pre-registered' ? "bg-green-50 text-green-600" : "bg-indigo-50 text-indigo-600"
                        )}>
                          {invite.visitorName[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{invite.visitorName}</p>
                          <p className="text-xs text-slate-500">{format(invite.scheduledDate.toDate(), 'PPP')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold font-mono">
                          {invite.code}
                        </span>
                        <button 
                          onClick={() => copyInviteLink(invite.code)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-100"
                          title="Copy Invite Link"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

              {activeTab === 'checkin' && user && (
                <motion.div 
                  key="checkin"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="max-w-2xl mx-auto space-y-8 w-full"
                >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Visitor Check-In</h2>
                <p className="text-slate-500">Enter invitation code or record a new walk-in visitor.</p>
              </div>

              <Card className="p-8">
                <div className="space-y-8">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Input 
                        label="Invitation Code (Optional)" 
                        value={checkInForm.code} 
                        onChange={(v) => setCheckInForm({...checkInForm, code: v})} 
                        placeholder="e.g. CP-001001"
                      />
                    </div>
                      <div className="flex gap-2">
                        <Button onClick={findInvitation} variant="secondary" className="h-[42px]">
                          <Search className="w-4 h-4" />
                          Find
                        </Button>
                        <Button 
                          onClick={() => setShowScanner(true)} 
                          variant="outline" 
                          className="h-[42px] border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                          title="Scan QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                          <span className="hidden sm:inline">Scan QR</span>
                        </Button>
                      </div>
                  </div>

                  {showScanner && (
                    <QRScanner 
                      onScan={(code) => {
                        setCheckInForm({ ...checkInForm, code });
                        setShowScanner(false);
                        // Auto-find after scan if code is valid
                        if (code) {
                          // We use a small delay to ensure the state update is processed
                          setTimeout(() => {
                            findInvitation();
                          }, 100);
                        }
                      }} 
                      onClose={() => setShowScanner(false)} 
                    />
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200"></span></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-500">Visitor Details</span></div>
                  </div>

                  <form onSubmit={handleCheckIn} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input 
                        label="Full Name" 
                        value={checkInForm.name} 
                        onChange={(v) => setCheckInForm({...checkInForm, name: v})} 
                        required
                      />
                      <Input 
                        label="Email Address" 
                        value={checkInForm.email} 
                        onChange={(v) => setCheckInForm({...checkInForm, email: v})} 
                        type="email"
                      />
                      <Input 
                        label="Phone Number" 
                        value={checkInForm.phone} 
                        onChange={(v) => setCheckInForm({...checkInForm, phone: v})} 
                      />
                      <Input 
                        label="Host Name" 
                        value={checkInForm.hostName} 
                        onChange={(v) => setCheckInForm({...checkInForm, hostName: v})} 
                        required
                      />
                      <div className="md:col-span-2">
                        <Input 
                          label="Purpose of Visit" 
                          value={checkInForm.purpose} 
                          onChange={(v) => setCheckInForm({...checkInForm, purpose: v})} 
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-sm font-medium text-slate-700">Visitor Photo</label>
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-20 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                            {checkInForm.photo ? (
                              <img src={checkInForm.photo} className="w-full h-full object-cover" alt="Visitor" />
                            ) : (
                              <Camera className="w-8 h-8 text-slate-300" />
                            )}
                          </div>
                          <div className="flex-1">
                            <input 
                              type="file" 
                              accept="image/*" 
                              capture="user"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    // Compress if needed, but for now just use the result
                                    setCheckInForm({...checkInForm, photo: reader.result as string});
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Take a photo or upload an image (Max 200KB).</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button type="submit" className="w-full py-3 text-lg">
                      <CheckCircle2 className="w-5 h-5" />
                      Complete Check-In
                    </Button>
                  </form>
                </div>
              </Card>
            </motion.div>
          )}

              {activeTab === 'log' && user && (
                <motion.div 
                  key="log"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6 w-full"
                >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Visitor Log</h2>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search visitors..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-bold">Visitor</th>
                        <th className="px-6 py-4 font-bold">Host</th>
                        <th className="px-6 py-4 font-bold">Check-In</th>
                        <th className="px-6 py-4 font-bold">Check-Out</th>
                        <th className="px-6 py-4 font-bold">Docs</th>
                        <th className="px-6 py-4 font-bold">Status</th>
                        <th className="px-6 py-4 font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visitors
                        .filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((visitor) => (
                        <tr key={visitor.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {visitor.photoUrl ? (
                                <img src={visitor.photoUrl} className="w-10 h-10 rounded-full object-cover border border-slate-200" alt="" />
                              ) : (
                                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600">
                                  {visitor.name[0]}
                                </div>
                              )}
                              <div>
                                <div className="font-medium text-slate-900">{visitor.name}</div>
                                <div className="text-xs text-slate-500">{visitor.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{visitor.hostName}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {visitor.checkInTime ? format(visitor.checkInTime.toDate(), 'MMM d, h:mm a') : '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {visitor.checkOutTime ? format(visitor.checkOutTime.toDate(), 'MMM d, h:mm a') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            {visitor.documents && visitor.documents.length > 0 ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <ShieldCheck className="w-4 h-4" />
                                <span className="text-xs font-medium">Verified</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">None</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide w-fit",
                                visitor.status === 'checked-in' ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                              )}>
                                {visitor.status}
                              </span>
                              {visitor.invitationId && (
                                <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-tighter">via Invitation</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {visitor.status === 'checked-in' && (
                              <button 
                                onClick={() => handleCheckOut(visitor.id)}
                                className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                              >
                                Check Out
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}

              {activeTab === 'info' && (
                <motion.div 
                  key="info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8 w-full"
                >
                  {!user && (
                    <Button 
                      onClick={() => setActiveTab('dashboard')} 
                      variant="ghost" 
                      className="mb-4 text-slate-500"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Login
                    </Button>
                  )}
                  <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Appointy Bhopal Office</h2>
                <p className="text-slate-500">Essential information for visitors and staff.</p>
                {!user && (
                  <Button onClick={() => setActiveTab('dashboard')} variant="ghost" className="mt-4 text-indigo-600">
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    Back to Login
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 space-y-4">
                  <div className="flex items-center gap-3 text-indigo-600">
                    <Wifi className="w-6 h-6" />
                    <h3 className="font-bold text-lg">Guest Wi-Fi</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Network Name:</span>
                      <span className="font-mono font-bold">Appointy_Guest</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Password:</span>
                      <span className="font-mono font-bold">Appointy@123</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 italic">Access is limited to 12 hours per check-in.</p>
                </Card>

                <Card className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-indigo-600">
                      <MapPin className="w-6 h-6" />
                      <h3 className="font-bold text-lg">Office Address</h3>
                    </div>
                    <a 
                      href="https://maps.app.goo.gl/9En6MM5beE7Si75c6" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      Get here <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-sm text-slate-600 space-y-2">
                    <p className="font-medium text-slate-900">Appointy Software Inc.</p>
                    <p>A19, A20, A21, IT PARK, Badwai Road, Barwai, Bhopal, Madhya Pradesh 462033</p>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600 pt-2 border-t border-slate-100">
                    <li className="flex gap-2">
                      <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0" />
                      Landmark: In front of Technotask business solutions.
                    </li>
                  </ul>
                </Card>

                <Card className="p-6 space-y-4 md:col-span-2">
                  <div className="flex items-center gap-3 text-indigo-600">
                    <ShieldCheck className="w-6 h-6" />
                    <h3 className="font-bold text-lg">Safety & Security Protocols</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { title: "Access Control", desc: "Please stay within designated visitor areas unless escorted by your host." },
                      { title: "Emergency Protocol", desc: "In case of an alarm, please follow staff instructions to the nearest assembly point." },
                      { title: "Confidentiality", desc: "Photography and recording are prohibited in work areas without prior approval." },
                    ].map((item, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-lg space-y-1 border border-slate-100">
                        <p className="font-bold text-slate-900 text-sm">{item.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

              {activeTab === 'visitor-portal' && (
                <motion.div 
                  key="visitor-portal"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="max-w-2xl mx-auto space-y-8 w-full"
                >
                  {!user && (
                    <Button 
                      onClick={() => setActiveTab('dashboard')} 
                      variant="ghost" 
                      className="mb-4 text-slate-500"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Login
                    </Button>
                  )}
                  <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Visitor Pre-Registration</h2>
                <p className="text-slate-500">Complete your details before arrival for a faster check-in.</p>
              </div>

              <Card className="p-8">
                {!currentInvitation ? (
                  <div className="space-y-6">
                    <Input 
                      label="Enter Invitation Code" 
                      value={visitorCode} 
                      onChange={setVisitorCode} 
                      placeholder="e.g. CP-001001"
                    />
                    <Button onClick={findInvitationForPortal} className="w-full py-3">
                      <ArrowRight className="w-5 h-5" />
                      Find My Invitation
                    </Button>
                    <Button onClick={() => setActiveTab('dashboard')} variant="outline" className="w-full">
                      Back to Login
                    </Button>
                    <Button onClick={() => setActiveTab('info')} variant="ghost" className="w-full text-slate-500">
                      <Info className="w-4 h-4" />
                      Campus Protocols
                    </Button>
                  </div>
                ) : preRegComplete ? (
                  <div className="text-center space-y-6">
                    <div className="flex justify-center">
                      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-slate-900">Pre-Registration Complete!</h3>
                      <p className="text-slate-500">Show this QR code at the reception for a fast check-in.</p>
                    </div>
                    
                    <div className="flex justify-center p-6 bg-white rounded-2xl border-2 border-slate-100 shadow-inner">
                      <QRCodeSVG value={currentInvitation.code} size={200} level="H" includeMargin />
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-xl">
                      <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Your Entry Code</p>
                      <p className="text-2xl font-mono font-bold text-slate-900">{currentInvitation.code}</p>
                    </div>

                    <Button 
                      onClick={() => {
                        setPreRegComplete(false);
                        setCurrentInvitation(null);
                        setVisitorCode('');
                        setActiveTab('dashboard');
                      }} 
                      className="w-full py-3"
                    >
                      Done
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handlePreRegistration} className="space-y-6">
                    <div className="bg-indigo-50 p-4 rounded-lg mb-6">
                      <p className="text-sm font-bold text-indigo-900">Welcome, {currentInvitation.visitorName}!</p>
                      <p className="text-xs text-indigo-700">Host: {currentInvitation.hostName} | Date: {format(currentInvitation.scheduledDate.toDate(), 'PPP')}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input 
                        label="Phone Number" 
                        value={preRegForm.phone} 
                        onChange={(v) => setPreRegForm({...preRegForm, phone: v})} 
                        required
                      />
                      <Input 
                        label="Purpose of Visit" 
                        value={preRegForm.purpose} 
                        onChange={(v) => setPreRegForm({...preRegForm, purpose: v})} 
                        placeholder={currentInvitation.purpose}
                      />
                      <div className="md:col-span-2 space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Upload Documents (Optional)</label>
                          <div className="flex flex-wrap gap-3">
                            {preRegForm.documents.map((doc, idx) => (
                              <div key={idx} className="relative w-20 h-20 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 group">
                                {doc.startsWith('data:image') ? (
                                  <img src={doc} className="w-full h-full object-cover" alt="" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <ClipboardList className="w-8 h-8" />
                                  </div>
                                )}
                                <button 
                                  type="button"
                                  onClick={() => removeDocument(idx)}
                                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-all text-slate-400 hover:text-indigo-500">
                              <Plus className="w-6 h-6" />
                              <span className="text-[10px] font-medium">Add File</span>
                              <input 
                                type="file" 
                                className="hidden" 
                                onChange={handleFileChange} 
                                multiple 
                                accept="image/*,.pdf"
                                disabled={isUploading}
                              />
                            </label>
                          </div>
                          <p className="text-[10px] text-slate-400">Max 500KB per file. Supported formats: Images, PDF.</p>
                        </div>
                        
                        <Input 
                          label="Document Name / ID Number (Optional)" 
                          value={preRegForm.documentName} 
                          onChange={(v) => setPreRegForm({...preRegForm, documentName: v})} 
                          placeholder="e.g. Passport Number or ID Name"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">For security, please provide your ID identifier. You will need to show the physical document upon arrival.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button onClick={() => setCurrentInvitation(null)} variant="outline" className="flex-1">
                        Cancel
                      </Button>
                      <Button type="submit" className="flex-[2] py-3">
                        <CheckCircle2 className="w-5 h-5" />
                        Complete Pre-Registration
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            </motion.div>
          )}
            </>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
