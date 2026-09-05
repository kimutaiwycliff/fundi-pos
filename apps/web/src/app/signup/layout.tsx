import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Start your free trial',
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: LayoutProps<'/signup'>) {
  return children;
}
