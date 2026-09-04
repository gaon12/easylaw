-- 출처 링크를 공개 열람 주소로 고친다. `CONVENTIONS.md` §7
--
-- **무엇이 잘못됐나.** 판례를 코퍼스에 넣을 때 출처를 오픈API 주소로 저장했다.
--
--   https://www.law.go.kr/DRF/lawService.do?target=prec&ID=622859&type=HTML
--
-- 이 주소는 **인증키(OC)를 요구한다.** 키 없이 열면 1,415바이트짜리 오류 페이지가 온다
-- (실측). 출처 링크를 누른 사람은 판결문 대신 그 오류를 본다.
--
-- **키를 붙여 고치지 않는다.** `law_api_oc`는 비밀 설정이고, 화면에 실리는 링크에 넣으면
-- 누구나 볼 수 있는 자리에 우리 인증키를 두는 일이 된다. 공개 열람 주소는 키 없이 열린다
-- (실측 69KB, 사건번호 포함).
--
-- 이미 저장된 행을 고친다. 새로 들어오는 행은 `server/lookup.ts`가 처음부터 공개 주소를 쓴다.
-- 되돌릴 필요는 없다 — 되돌리면 다시 열리지 않는 링크가 된다.

UPDATE `judgment`
SET `source_url` = 'https://www.law.go.kr/precInfoP.do?precSeq=' ||
  replace(
    replace(`source_url`, 'https://www.law.go.kr/DRF/lawService.do?target=prec&ID=', ''),
    '&type=HTML',
    ''
  )
WHERE `source_url` LIKE 'https://www.law.go.kr/DRF/lawService.do?target=prec&ID=%';
