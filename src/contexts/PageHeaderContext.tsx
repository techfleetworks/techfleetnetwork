import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderData {
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
  description?: string;
  badge?: ReactNode;
}

interface PageHeaderContextValue {
  header: PageHeaderData | null;
  setHeader: (data: PageHeaderData | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  header: null,
  setHeader: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<PageHeaderData | null>(null);
  const setHeader = useCallback((data: PageHeaderData | null) => setHeaderState(data), []);

  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  return useContext(PageHeaderContext);
}
