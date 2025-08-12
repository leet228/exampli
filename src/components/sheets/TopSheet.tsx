import { AnimatePresence, motion } from 'framer-motion';
import { PropsWithChildren, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement>; title?: string };

export default function TopSheet({
  open, onClose, anchor, title, children
}: { open:boolean; onClose:()=>void; anchor:React.RefObject<HTMLElement>; title:string; children:React.ReactNode }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drop-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: .18, ease: [0.22,1,0.36,1] }}
          />
          <motion.div
            className="drop-panel"
            style={{ top: (anchor.current?.getBoundingClientRect().bottom ?? 0) + 4, willChange: 'transform' }}
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: .24, ease: [0.22,1,0.36,1] }}
          >
            <div className="p-3 border-b border-white/10 text-center font-semibold">{title}</div>
            <div className="p-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}