import { EnvironmentProviders, importProvidersFrom } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

export function provideTranslateService(): EnvironmentProviders {
  return importProvidersFrom(
    TranslateModule.forRoot({
      loader: provideTranslateHttpLoader({
        prefix: './i18n/',
        suffix: '.json'
      }),
      fallbackLang: 'es'
    })
  );
}
