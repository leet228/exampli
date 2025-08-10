import { motion } from 'framer-motion';

export default function TopBar() {
  return (
    <div className="flex items-center justify-center mb-6">
      <motion.h1 layoutId="brand" className="text-2xl font-extrabold tracking-tight">
        exampli
      </motion.h1>
    </div>
  );
}