-- Les statuts "contacte", "lead_chaud" et "rdv" écrits avant ce correctif ne
-- sont adossés à aucun événement vérifié (voir CHANGELOG / audit KPI du
-- 2026-09-01) : "contacte" ne mesurait qu'un res.ok Brevo (acceptation en
-- file, pas remise), "lead_chaud" une vue de page pouvant venir d'un
-- scanner de sécurité, "rdv" un clic sur bouton pouvant venir du même
-- scanner. On ne les efface pas (perte d'info) et on ne les garde pas tels
-- quels (ça continuerait à mentir sous un nom qui a maintenant un sens
-- vérifié) : on les requalifie explicitement comme non vérifiés.
--
-- Ne touche QUE les lignes dont le statut est encore l'une de ces trois
-- valeurs au moment de la migration — si une ligne a déjà un statut plus
-- récent (ex. "signe", "desabonne"), elle est laissée intacte.

UPDATE "Prospect" SET "statut" = 'contacte_non_verifie' WHERE "statut" = 'contacte';
UPDATE "Prospect" SET "statut" = 'audit_vu_non_verifie' WHERE "statut" = 'lead_chaud';
UPDATE "Prospect" SET "statut" = 'cta_clique_non_verifie' WHERE "statut" = 'rdv';
