import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function TopBar() {
  return (
    <div className="flex items-center justify-between mb-6">
      <motion.h1 layoutId="brand" className="text-2xl font-extrabold tracking-tight">
        exampli
      </motion.h1>
      <Link to="/profile" className="btn-outline">Профиль</Link>
    </div>
  );
}