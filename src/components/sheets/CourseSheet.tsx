import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import BottomSheet from './BottomSheet';
import { setUserSubjects } from '../../lib/userState';

export default function CourseSheet({ open, onClose, onPicked }: { open: boolean; onClose: () => void; onPicked: (title: string) => void }){
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => { if (!open) return; (async () => { const { data } = await supabase.from('subjects').select('*').order('title'); setSubjects(data || []); })(); }, [open]);

  const pick = async (s: any) => {
    await setUserSubjects([s.code]);
    onPicked(s.title);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Курс">
      <div className="grid gap-3">
        {subjects.map((s) => (
          <button key={s.id} onClick={() => pick(s)} className="flex items-center justify-between p-4 rounded-3xl bg-white/5 border border-white/10">
            <div>
              <div className="font-semibold">{s.title}</div>
              <div className="text-xs text-muted">{s.level}</div>
            </div>
            <div className="text-2xl">📘</div>
          </button>
        ))}
        <button className="btn w-full" onClick={() => alert('Добавить новый курс — скоро')}>+ Добавить курс</button>
      </div>
    </BottomSheet>
  );
}