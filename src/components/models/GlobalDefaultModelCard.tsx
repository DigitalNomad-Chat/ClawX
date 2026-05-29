import { useState } from 'react';
import { Settings2, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgentsStore } from '@/stores/agents';
import { ModelSelectorModal } from './ModelSelectorModal';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function GlobalDefaultModelCard() {
  const { t } = useTranslation('agents');
  const { defaultModelRef, updateDefaultModel } = useAgentsStore();
  const [showModal, setShowModal] = useState(false);

  const handleSave = async (modelRef: string | null) => {
    await updateDefaultModel(modelRef);
    toast.success(modelRef ? t('toast.defaultModelUpdated') : t('toast.defaultModelCleared'));
  };

  return (
    <>
      <Card className="rounded-xl border shadow-sm bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            {t('globalDefaultModel.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('globalDefaultModel.currentLabel')}</p>
              <p className="font-mono text-sm text-foreground break-all">
                {defaultModelRef || t('globalDefaultModel.notSet')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              {t('globalDefaultModel.configure')}
            </Button>
          </div>
        </CardContent>
      </Card>
      {showModal && (
        <ModelSelectorModal
          title={t('globalDefaultModel.configureTitle')}
          description={t('globalDefaultModel.configureDescription')}
          currentModelRef={defaultModelRef}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
