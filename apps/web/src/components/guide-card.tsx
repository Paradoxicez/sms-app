import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface GuideCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export function GuideCard({ title, description, href, icon: Icon }: GuideCardProps) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-secondary/50">
        <CardContent className="flex flex-col gap-3 p-5">
          <Icon className="h-6 w-6 text-primary" />
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
