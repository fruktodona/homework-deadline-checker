
(() => {
  // Удаляем только панель предыдущего запуска.
  document.getElementById('dz-deadline-audit')?.remove();

  const clean = value =>
    String(value ?? '').replace(/\s+/g, ' ').trim();

  const escapeHTML = value =>
    String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  // Сроки 2026/27 учебного года.
  // Все даты включительно, до 23:59 МСК.
  function expectedDate(week, grade) {
    // I четверть
    if (week >= 1 && week <= 6) return '22.10.2026';
    if (week === 7) return '23.10.2026';

    // II четверть
    if (week >= 10 && week <= 14) return '21.12.2026';
    if (week >= 15 && week <= 16) return '22.12.2026';

    // III четверть
    if (week >= 20 && week <= 24) return '15.03.2027';
    if (week >= 25 && week <= 27) return '16.03.2027';
    if (week === 28) return '17.03.2027';

    // IV четверть
    if (week >= 31 && week <= 38) {
      if (!Number.isInteger(grade) || grade < 1 || grade > 11) {
        return null;
      }

      // 9 и 11 классы
      if (grade === 9 || grade === 11) {
        if (week <= 33) return '26.04.2027';
        if (week === 34) return '27.04.2027';
        if (week === 35) return '04.05.2027';

        // Для недель 36–38 норматив не указан.
        return null;
      }

      // 1–8 и 10 классы
      if (week <= 34) return '11.05.2027';
      if (week <= 36) return '12.05.2027';
      return '21.05.2027';
    }

    // Недели без заданного норматива.
    return null;
  }

  const months = {
    января: 1,
    февраля: 2,
    марта: 3,
    апреля: 4,
    мая: 5,
    июня: 6,
    июля: 7,
    августа: 8,
    сентября: 9,
    октября: 10,
    ноября: 11,
    декабря: 12
  };

  // Преобразует дату сайта в формат ДД.ММ.ГГГГ ЧЧ:ММ.
  // Поддерживает даты с годом и без года.
  function normalizeDate(value) {
    const text = clean(value).toLowerCase();

    const numeric = text.match(
      /(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/
    );

    if (numeric) {
      let [, day, month, year, hour, minute] = numeric;

      if (year.length === 2) year = '20' + year;

      return [
        day.padStart(2, '0'),
        month.padStart(2, '0'),
        year
      ].join('.') + ' ' +
        String(hour ?? '23').padStart(2, '0') + ':' +
        String(minute ?? '59').padStart(2, '0');
    }

    // Пример: 22 октября 23:59 (МСК)
    // Или:    22 октября 2026 23:59 (МСК)
    const written = text.match(
      /(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?\s+(\d{1,2}):(\d{2})/
    );

    if (written && months[written[2]]) {
      const day = written[1].padStart(2, '0');
      const monthNumber = months[written[2]];
      const month = String(monthNumber).padStart(2, '0');

      // Если год отсутствует, определяем его по учебному году.
      const year = written[3] ||
        (monthNumber >= 9 ? '2026' : '2027');

      return [
        day,
        month,
        year
      ].join('.') + ' ' +
        written[4].padStart(2, '0') + ':' +
        written[5].padStart(2, '0');
    }

    return null;
  }

  // Ищем карточки ДЗ на текущей странице.
  const cards = [
    ...document.querySelectorAll(
      'li[ng-repeat="homework in homeworks"]'
    )
  ];

  const data = [];
  const errors = [];
  const warnings = [];

  let expressCount = 0;
  let individualCount = 0;
  let outsideCount = 0;
  let checkedCount = 0;

  for (const card of cards) {
    const fullText = clean(card.textContent);

    // Полностью исключаем тариф «Экспресс».
    if (
      /Пользователи с тарифом\s*[«"„]?Экспресс/i.test(fullText) &&
      /не могут отправлять ДЗ на проверку/i.test(fullText)
    ) {
      expressCount++;
      continue;
    }

    const weekText = clean(
      card.querySelector('.homework-week-number')?.textContent
    );

    const week = Number(weekText);

    const gradeText = clean(
      card.querySelector(
        '[ng-bind="homework.subject.grade"]'
      )?.textContent
    );

    const grade = Number(gradeText);

    const subject = clean(
      card.querySelector(
        '[ng-bind="::homework.subject.admin_title"]'
      )?.textContent
    ) || 'Предмет не определён';

    const lesson = clean(
      card.querySelector(
        '[ng-bind="::getLessonName(homework.lesson_name)"]'
      )?.textContent
    );

    // Проверяем, удалось ли прочитать номер недели.
    if (!weekText || !Number.isInteger(week)) {
      warnings.push(
        `Не удалось определить неделю: ${subject}, ` +
        `${gradeText || 'класс неизвестен'}`
      );
      continue;
    }

    // Проверяем класс.
    if (
      !gradeText ||
      !Number.isInteger(grade) ||
      grade < 1 ||
      grade > 11
    ) {
      warnings.push(
        `Не удалось определить класс: ${subject}, неделя ${week}`
      );
      continue;
    }

    const date = expectedDate(week, grade);

    // Пропускаем недели, для которых нет норматива.
    if (!date) {
      outsideCount++;
      continue;
    }

    // Ищем текст срока в карточке.
    const deadlineText = [
      ...card.querySelectorAll('strong')
    ]
      .map(element => clean(element.textContent))
      .find(text =>
        /^Срок выполнения ДЗ:/i.test(text)
      );

    const actual = deadlineText
      ? clean(
          deadlineText.replace(
            /^Срок выполнения ДЗ:\s*/i,
            ''
          )
        )
      : '';

    // Учитываем неделю как представленную на странице.
    data.push({
      week,
      grade,
      subject
    });

    // Индивидуальные сроки не являются ошибкой.
    if (/индивидуальн/i.test(actual)) {
      individualCount++;
      continue;
    }

    // Если срок отсутствует, показываем предупреждение.
    if (!actual) {
      warnings.push(
        `Не найден срок: ${subject}, ` +
        `${grade} класс, неделя ${week}`
      );
      continue;
    }

    const actualNormalized = normalizeDate(actual);
    const correctNormalized = date + ' 23:59';

    if (!actualNormalized) {
      warnings.push(
        `Не удалось распознать срок "${actual}": ` +
        `${subject}, ${grade} класс, неделя ${week}`
      );
      continue;
    }

    checkedCount++;

    // Проверяем каждую карточку отдельно.
    if (actualNormalized !== correctNormalized) {
      errors.push({
        subject,
        grade,
        week,
        lesson,
        actual,
        correct: date
      });
    }
  }

  // Объединяем одинаковые ошибки.
  const grouped = new Map();

  for (const error of errors) {
    const key = [
      error.subject,
      error.grade,
      error.week,
      error.lesson,
      error.actual
    ].join('\u0001');

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...error,
        count: 0
      });
    }

    grouped.get(key).count++;
  }

  const rows = [...grouped.values()].sort(
    (a, b) =>
      a.grade - b.grade ||
      a.subject.localeCompare(b.subject, 'ru') ||
      a.week - b.week
  );

  // Недели с установленными сроками.
  const expectedWeeks = [
    ...Array.from({ length: 7 }, (_, i) => i + 1),
    ...Array.from({ length: 7 }, (_, i) => i + 10),
    ...Array.from({ length: 9 }, (_, i) => i + 20),
    ...Array.from({ length: 8 }, (_, i) => i + 31)
  ];

  const seen = new Set(data.map(item => item.week));

  const missing = expectedWeeks.filter(
    week => !seen.has(week)
  );

  // Для передачи в техотдел:
  // Предмет — Класс — Неделя — Неверный срок — Верный срок.
  // Без заголовков, только ошибки.
  const report = rows.map(item => [
    item.subject,
    item.grade,
    item.week,
    item.actual,
    item.correct.replace(/\.20(\d{2})$/, '.$1')
  ].map(value =>
    String(value).replace(/[\t\r\n]+/g, ' ')
  ).join('\t')).join('\n');

  // Создаём панель результатов.
  const panel = document.createElement('section');
  panel.id = 'dz-deadline-audit';

  panel.style.cssText = `
    position:fixed;
    z-index:2147483647;
    right:16px;
    top:16px;
    width:min(760px,calc(100vw - 32px));
    max-height:85vh;
    overflow:auto;
    background:#fff;
    color:#202124;
    border:1px solid #ddd;
    border-radius:12px;
    box-shadow:0 10px 35px #0004;
    padding:20px;
    font:14px/1.5 Arial,sans-serif;
  `;

  const incomplete =
    cards.length === 0 || warnings.length > 0;

  const table = rows.length ? `
    <h3 style="margin-bottom:8px">
      Найденные ошибки
    </h3>

    <div style="overflow:auto">
      <table style="
        border-collapse:collapse;
        width:100%;
      ">
        <thead>
          <tr>
            ${[
              'Предмет',
              'Класс',
              'Неделя',
              'Неверный срок',
              'Верный срок',
              'Карточек'
            ].map(title => `
              <th style="
                padding:7px;
                border-bottom:1px solid #ccc;
                text-align:left;
              ">
                ${title}
              </th>
            `).join('')}
          </tr>
        </thead>

        <tbody>
          ${rows.map(item => `
            <tr>
              ${[
                item.subject,
                item.grade,
                item.week,
                item.actual,
                item.correct.replace(
                  /\.20(\d{2})$/,
                  '.$1'
                ),
                item.count
              ].map(value => `
                <td style="
                  padding:7px;
                  border-bottom:1px solid #eee;
                  vertical-align:top;
                ">
                  ${escapeHTML(value)}
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  panel.innerHTML = `
    <div style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
    ">
      <b style="font-size:18px">
        Проверка сроков ДЗ · 2026/27
      </b>

      <button id="dz-close"
        style="cursor:pointer">
        ✕
      </button>
    </div>

    <p>
      Карточек на странице:
      <b>${cards.length}</b>
      <br>
      Проверено обычных сроков:
      <b>${checkedCount}</b>
      <br>
      Карточек с ошибками:
      <b>${errors.length}</b>
      <br>
      Уникальных записей об ошибках:
      <b>${rows.length}</b>
    </p>

    <p style="
      font-size:16px;
      font-weight:bold;
    ">
      ${
        rows.length
          ? `❌ Найдено ошибок: ${errors.length}`
          : incomplete
            ? '⚠️ Ошибок не найдено, но проверка неполная'
            : '✅ Ошибок среди проверенных карточек нет'
      }
    </p>

    <div style="
      background:#f5f5f5;
      border-radius:8px;
      padding:10px;
    ">
      <b>Статистика:</b>

      <div>
        Индивидуальные сроки: ${individualCount}
      </div>

      <div>
        Тариф «Экспресс»: ${expressCount}
      </div>

      <div>
        Недели без заданного норматива: ${outsideCount}
      </div>

      <div>
        Карточки с проблемами распознавания:
        ${warnings.length}
      </div>
    </div>

    ${warnings.length ? `
      <details style="margin-top:12px">
        <summary style="
          cursor:pointer;
          color:#a60;
        ">
          ⚠️ Проблемы распознавания
          (${warnings.length})
        </summary>

        <div style="
          max-height:160px;
          overflow:auto;
        ">
          ${warnings.map(warning => `
            <div style="padding:4px 0">
              ${escapeHTML(warning)}
            </div>
          `).join('')}
        </div>
      </details>
    ` : ''}

    <details style="margin-top:12px">
      <summary style="cursor:pointer">
        Недели, отсутствующие в текущей выгрузке
        (${missing.length})
      </summary>

      <p>
        ${missing.length ? missing.join(', ') : 'Нет'}
      </p>

      <p style="
        font-size:12px;
        color:#666;
      ">
        Отсутствие недели не означает ошибку.
        На странице могут действовать фильтры
        или быть загружены не все карточки.
      </p>
    </details>

    ${table}

    <p style="
      font-size:12px;
      color:#666;
    ">
      Проверяются только карточки, доступные
      на текущей странице. Скрипт не изменяет
      данные сайта. Индивидуальные сроки
      и тариф «Экспресс» исключаются.
      Все нормативные даты — до 23:59 МСК.
    </p>

    <button
      id="dz-copy"
      ${rows.length ? '' : 'disabled'}
      style="
        padding:9px 14px;
        border:0;
        border-radius:6px;
        background:${rows.length ? '#1867c0' : '#ccc'};
        color:${rows.length ? '#fff' : '#666'};
        cursor:${rows.length ? 'pointer' : 'not-allowed'};
      ">
      ${
        rows.length
          ? 'Скопировать ошибки'
          : 'Ошибок нет'
      }
    </button>

    <span
      id="dz-status"
      style="margin-left:8px">
    </span>
  `;

  document.body.append(panel);

  // Закрытие панели.
  panel.querySelector('#dz-close').onclick = () =>
    panel.remove();

  // Копирование ошибок.
  if (rows.length) {
    panel.querySelector('#dz-copy').onclick = async () => {
      const status = panel.querySelector('#dz-status');

      try {
        await navigator.clipboard.writeText(report);
        status.textContent = 'Скопировано!';
      } catch {
        const area = document.createElement('textarea');
        area.value = report;

        document.body.append(area);
        area.select();

        const success = document.execCommand('copy');
        area.remove();

        status.textContent = success
          ? 'Скопировано!'
          : 'Не удалось скопировать';
      }
    };
  }
})();
