"use client";

import Image from 'next/image';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function DonateQRModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-w-[90vw] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center font-bold">Buy Me a Coffee</DialogTitle>
        </DialogHeader>

        <div className="text-center space-y-4 flex flex-col items-center">
          <div className="w-full max-w-[320px] mx-auto">
            <Image
              src="/qr.png"
              alt="QR code for bank transfer donation"
              width={320}
              height={320}
              className="w-full h-auto object-contain rounded-xl shadow-lg"
            />
          </div>

          <p className="text-sm text-muted-foreground">Scan to support the project</p>

          <Button
            onClick={onClose}
            variant="outline"
            className="min-h-11 px-6"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
