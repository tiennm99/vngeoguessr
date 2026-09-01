"use client";

import Image from 'next/image';

import { Beer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DonateQRModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-w-[90vw] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-2xl text-center font-bold">
            Buy Me a Beer <Beer className="size-6" aria-hidden="true" />
          </DialogTitle>
          <DialogDescription className="text-center">
            Scan the QR code to send a bank-transfer donation
          </DialogDescription>
        </DialogHeader>

        <div className="text-center space-y-4 flex flex-col items-center">
          <div className="w-full max-w-[280px] mx-auto">
            <Image
              src="/zlp.jpg"
              alt="QR code for bank transfer donation"
              width={768}
              height={1024}
              className="w-full h-auto object-contain rounded-xl shadow-lg"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
