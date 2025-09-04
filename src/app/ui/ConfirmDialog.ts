import '../../style/modern-ui.css';
import { html } from './HtmlTag';

export interface ConfirmDialogOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmClass?: string;
    onConfirm: () => void;
    onCancel?: () => void;
}

export class ConfirmDialog {
    private static instances = new WeakMap<Element, ConfirmDialog>();
    private container: HTMLElement;
    private options: ConfirmDialogOptions;

    constructor(options: ConfirmDialogOptions) {
        this.options = {
            confirmText: '确认',
            cancelText: '取消',
            confirmClass: 'btn-primary',
            ...options
        };
        this.container = document.createElement('div');
        this.render();
    }

    private render(): void {
        const content = html`
            <div class="confirm-dialog-overlay">
                <div class="confirm-dialog glass-effect">
                    <div class="confirm-dialog-header">
                        <div class="dialog-icon"></div>
                        <h3 class="confirm-dialog-title">${this.options.title}</h3>
                    </div>
                    <div class="confirm-dialog-body">
                        <p class="confirm-dialog-message">${this.options.message}</p>
                    </div>
                    <div class="confirm-dialog-actions">
                        <button class="btn btn-secondary" onclick="ConfirmDialog.handleCancel(this)">
                            ${this.options.cancelText}
                        </button>
                        <button class="btn ${this.options.confirmClass}" onclick="ConfirmDialog.handleConfirm(this)">
                            ${this.options.confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `.content;

        this.container.innerHTML = '';
        const dialogElement = content.firstElementChild;
        this.container.appendChild(dialogElement!);
        
        // Store instance reference
        ConfirmDialog.instances.set(dialogElement!, this);
    }

    public static handleConfirm(button: HTMLElement): void {
        const dialog = button.closest('.confirm-dialog-overlay');
        if (dialog) {
            const instance = ConfirmDialog.instances.get(dialog);
            if (instance) {
                instance.options.onConfirm();
                instance.close();
            }
        }
    }

    public static handleCancel(button: HTMLElement): void {
        const dialog = button.closest('.confirm-dialog-overlay');
        if (dialog) {
            const instance = ConfirmDialog.instances.get(dialog);
            if (instance) {
                if (instance.options.onCancel) {
                    instance.options.onCancel();
                }
                instance.close();
            }
        }
    }

    public show(): void {
        document.body.appendChild(this.container);
        // Add animation
        setTimeout(() => {
            const overlay = this.container.querySelector('.confirm-dialog-overlay');
            if (overlay) {
                overlay.classList.add('show');
            }
        }, 10);
    }

    public close(): void {
        const overlay = this.container.querySelector('.confirm-dialog-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                if (this.container.parentElement) {
                    this.container.parentElement.removeChild(this.container);
                }
            }, 300);
        }
    }

    public static confirm(options: ConfirmDialogOptions): void {
        const dialog = new ConfirmDialog(options);
        dialog.show();
    }
}

// Make ConfirmDialog available globally
declare global {
    interface Window {
        ConfirmDialog: typeof ConfirmDialog;
    }
}
window.ConfirmDialog = ConfirmDialog;