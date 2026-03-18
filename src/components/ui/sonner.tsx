import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      expand={false}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-md group-[.toaster]:shadow-lg group-[.toaster]:border group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:w-full group-[.toaster]:max-w-lg",
          description: "group-[.toast]:text-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:bg-emerald-100 group-[.toaster]:text-emerald-900 group-[.toaster]:border-emerald-300 dark:group-[.toaster]:bg-emerald-900/80 dark:group-[.toaster]:text-emerald-100 dark:group-[.toaster]:border-emerald-700",
          error:
            "group-[.toaster]:bg-red-100 group-[.toaster]:text-red-900 group-[.toaster]:border-red-300 dark:group-[.toaster]:bg-red-900/80 dark:group-[.toaster]:text-red-100 dark:group-[.toaster]:border-red-700",
          info:
            "group-[.toaster]:bg-blue-100 group-[.toaster]:text-blue-900 group-[.toaster]:border-blue-300 dark:group-[.toaster]:bg-blue-900/80 dark:group-[.toaster]:text-blue-100 dark:group-[.toaster]:border-blue-700",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
