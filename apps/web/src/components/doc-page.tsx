import Link from "next/link";

interface DocPageProps {
  title: string;
  children: React.ReactNode;
}

export function DocPage({ title, children }: DocPageProps) {
  return (
    <div className="space-y-6 p-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/app/developer/docs" className="hover:text-foreground">Developer</Link>
        <span>/</span>
        <Link href="/app/developer/docs" className="hover:text-foreground">Documentation</Link>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </nav>
      <h1 className="text-[28px] font-semibold">{title}</h1>
      <div className="prose prose-sm max-w-none space-y-6">
        {children}
      </div>
    </div>
  );
}
