"use client";

import Image from 'next/image';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function DonateQRModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-w-[90vw] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center font-bold">
            Buy Me a Beer <span aria-hidden="true">🍺</span>
          </DialogTitle>
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

          <p className="text-sm text-muted-foreground">Scan to buy me a beer</p>

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
