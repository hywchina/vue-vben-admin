import type { BasicUserInfo } from '@vben/types';

export interface Props {
  avatarUploading?: boolean;
  title?: string;
  userInfo: BasicUserInfo | null;
  tabs: {
    label: string;
    value: string;
  }[];
}

export interface FormSchemaItem {
  description: string;
  disabled?: boolean;
  fieldName: string;
  label: string;
  value: boolean;
}

export interface SettingProps {
  formSchema: FormSchemaItem[];
}
