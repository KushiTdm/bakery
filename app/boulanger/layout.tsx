export default function BoulangerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#1A0F0A' }}>
      {children}
    </div>
  );
}
