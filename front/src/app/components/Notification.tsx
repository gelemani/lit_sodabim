import React, { useEffect } from 'react';

interface NotificationProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);

        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className={`p-4 rounded-lg shadow-lg ${
                type === 'success' ? 'bg-green-500' : 'bg-red-500'
            } text-white min-w-[300px] text-center`}>
                {message}
            </div>
        </div>
    );
};

export default Notification; 