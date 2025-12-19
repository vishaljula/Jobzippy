import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <>
      <style>{`
        [data-sonner-toast],
        [data-sonner-toast] > div {
          position: relative !important;
        }
        /* Target sonner's close button - comprehensive selectors */
        [data-sonner-toast] button[data-close-button],
        [data-sonner-toast] button[aria-label*="close" i],
        [data-sonner-toast] button[aria-label*="Close" i],
        [data-sonner-toast] > button:last-child,
        [data-sonner-toast] button[type="button"]:last-child,
        [data-sonner-toast] [data-close-button],
        .group.toast button:last-of-type,
        [data-sonner-toast] button[class*="close"],
        [data-sonner-toast] > div > button:last-child {
          position: absolute !important;
          top: -0.75rem !important;
          right: -0.75rem !important;
          left: auto !important;
          margin: 0 !important;
          order: 999 !important;
          z-index: 10 !important;
          transform: none !important;
        }
        /* Button is outside container, no need for extra padding */
      `}</style>
      <Sonner
        theme={theme as ToasterProps['theme']}
        className="toaster group"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-900 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl',
            description: 'group-[.toast]:text-slate-600',
            success: 'group-[.toast]:border-emerald-200 group-[.toast]:bg-emerald-50/50',
            error: 'group-[.toast]:border-red-200 group-[.toast]:bg-red-50/50',
            info: 'group-[.toast]:border-blue-200 group-[.toast]:bg-blue-50/50',
            warning: 'group-[.toast]:border-amber-200 group-[.toast]:bg-amber-50/50',
            loading: 'group-[.toast]:border-slate-200 group-[.toast]:bg-white',
            actionButton:
              'group-[.toast]:bg-gradient-to-r group-[.toast]:from-primary-500 group-[.toast]:to-secondary-500 group-[.toast]:text-white group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:shadow-sm',
            cancelButton:
              'group-[.toast]:bg-slate-100 group-[.toast]:text-slate-700 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:hover:bg-slate-200',
            closeButton:
              'group-[.toast]:bg-white group-[.toast]:border group-[.toast]:border-slate-200 group-[.toast]:text-slate-400 group-[.toast]:hover:text-slate-700 group-[.toast]:hover:bg-slate-50 group-[.toast]:hover:border-slate-300 group-[.toast]:rounded-full group-[.toast]:shadow-sm group-[.toast]:absolute group-[.toast]:-top-3 group-[.toast]:-right-3 group-[.toast]:left-auto group-[.toast]:m-0 group-[.toast]:h-6 group-[.toast]:w-6 group-[.toast]:flex group-[.toast]:items-center group-[.toast]:justify-center group-[.toast]:transition-colors',
          },
        }}
        {...props}
      />
    </>
  );
};

export { Toaster };
